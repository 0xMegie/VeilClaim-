/**
 * Browser provider wiring: Lace (DApp Connector API v4) for balancing/submission and the
 * wallet-configured proof server for real ZK proofs.
 */
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  type Binding,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  type VeilClaimCircuitId,
  type VeilClaimPrivateStateId,
  type VeilClaimProviders,
  type VeilClaimPublicState,
  toPublicState,
} from '@veilclaim/api';
import { VeilClaim, type VeilClaimPrivateState } from '@veilclaim/contract';
import { type Observable, map } from 'rxjs';
import semver from 'semver';
import { INDEXER_URL, INDEXER_WS_URL, NETWORK_ID } from './config';
import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

// ── Transaction stages ─────────────────────────────────────────────────

export type TxStage = 'proving' | 'balancing' | 'submitting';
type StageListener = (stage: TxStage) => void;
const stageListeners = new Set<StageListener>();

export const onTxStage = (listener: StageListener): (() => void) => {
  stageListeners.add(listener);
  return () => stageListeners.delete(listener);
};

const emitStage = (stage: TxStage) => stageListeners.forEach((listener) => listener(stage));

// ── Public state without a wallet ──────────────────────────────────────

// Pass the browser WebSocket explicitly: isomorphic-ws's browser build has no named export,
// so the provider's default would be undefined and ledger subscriptions would never connect.
export const publicState$ = (contractAddress: string): Observable<VeilClaimPublicState> =>
  indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL, WebSocket)
    .contractStateObservable(contractAddress, { type: 'latest' })
    .pipe(map((state) => toPublicState(VeilClaim.ledger(state.data))));

// ── Wallet ─────────────────────────────────────────────────────────────

const findWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find(
    (w): w is InitialAPI =>
      !!w && typeof w === 'object' && 'apiVersion' in w && semver.satisfies(w.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );

const connectWallet = async (): Promise<ConnectedAPI> => {
  const deadline = Date.now() + 3_000;
  let wallet = findWallet();
  while (!wallet && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    wallet = findWallet();
  }
  if (!wallet) throw new Error('Midnight Lace wallet not found. Install Lace and enable Midnight, then reload.');
  return wallet.connect(NETWORK_ID);
};

export const initializeProviders = async (): Promise<VeilClaimProviders> => {
  setNetworkId(NETWORK_ID);

  const wallet = await connectWallet();
  const config = await wallet.getConfiguration();
  if (!config.proverServerUri) throw new Error('Lace has no proof server configured. Set it to http://localhost:6300.');
  const addresses = await wallet.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<VeilClaimCircuitId>(window.location.origin, fetch.bind(window));
  const proofProvider = httpClientProofProvider(config.proverServerUri, zkConfigProvider);

  return {
    privateStateProvider: inMemoryPrivateStateProvider<VeilClaimPrivateStateId, VeilClaimPrivateState>(),
    zkConfigProvider,
    proofProvider: {
      proveTx: (tx, proveTxConfig) => {
        emitStage('proving');
        return proofProvider.proveTx(tx, proveTxConfig);
      },
    },
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri, WebSocket),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        emitStage('balancing');
        const balanced = await wallet.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(balanced.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        emitStage('submitting');
        await wallet.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
};

/**
 * Browser provider wiring: Lace (DApp Connector API v4) for balancing/submission and the
 * wallet-configured proof server for real ZK proofs.
 */
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
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
import type { VeilClaimCircuitId, VeilClaimProviders, VeilClaimPrivateStateId } from '@veilclaim/api';
import type { VeilClaimPrivateState } from '@veilclaim/contract';
import semver from 'semver';
import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

const findWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find(
    (w): w is InitialAPI =>
      !!w && typeof w === 'object' && 'apiVersion' in w && semver.satisfies(w.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );

const connectWallet = async (networkId: NetworkId): Promise<ConnectedAPI> => {
  const deadline = Date.now() + 3_000;
  let wallet = findWallet();
  while (!wallet && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    wallet = findWallet();
  }
  if (!wallet) throw new Error('Midnight Lace wallet not found.');
  return wallet.connect(networkId);
};

export const NETWORK_ID: NetworkId = (import.meta.env.VITE_NETWORK_ID as NetworkId | undefined) ?? 'preprod';

export const initializeProviders = async (): Promise<VeilClaimProviders> => {
  const networkId = NETWORK_ID;
  setNetworkId(networkId);

  const wallet = await connectWallet(networkId);
  const config = await wallet.getConfiguration();
  if (!config.proverServerUri) throw new Error('Lace has no proof server configured.');
  const addresses = await wallet.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<VeilClaimCircuitId>(window.location.origin, fetch.bind(window));

  return {
    privateStateProvider: inMemoryPrivateStateProvider<VeilClaimPrivateStateId, VeilClaimPrivateState>(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    // Pass the browser WebSocket explicitly: isomorphic-ws's browser build has no named export,
    // so the provider's default would be undefined and ledger subscriptions would never connect.
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri, WebSocket),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await wallet.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(balanced.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await wallet.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
};

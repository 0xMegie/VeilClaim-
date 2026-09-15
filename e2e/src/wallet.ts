/**
 * Headless Midnight wallet for e2e runs: sync, DUST registration, and midnight-js providers.
 * Adapted from midnightntwrk/example-counter counter-cli/src/api.ts (Apache-2.0).
 */
import { resolve } from 'node:path';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  InMemoryTransactionHistoryStorage,
  PublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
  createKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import {
  type VeilClaimCircuitId,
  type VeilClaimPrivateStateId,
  type VeilClaimProviders,
  inMemoryPrivateStateProvider,
} from '@veilclaim/api';
import type { VeilClaimPrivateState } from '@veilclaim/contract';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { NETWORK_ID, deriveKeys } from './wallets.js';

// Wallet sync uses GraphQL subscriptions over a global WebSocket. Bun has a native one (replacing it with the
// `ws` package makes the indexer subscription close immediately); plain Node before v22 needs the polyfill.
const g = globalThis as { WebSocket?: unknown };
g.WebSocket ??= WebSocket;
const RuntimeWebSocket = g.WebSocket as never;

export const PREPROD = {
  // Wallet SDK 3.x speaks indexer API v3; midnight-js 4.1.x speaks v4.
  walletIndexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  walletIndexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: process.env.PROOF_SERVER_URL ?? 'http://127.0.0.1:6300',
} as const;

const ZK_CONFIG_PATH = resolve(import.meta.dirname, '..', '..', 'contract', 'src', 'managed', 'veilclaim');

export interface WalletContext {
  readonly role: string;
  readonly wallet: WalletFacade;
  readonly shieldedSecretKeys: ledger.ZswapSecretKeys;
  readonly dustSecretKey: ledger.DustSecretKey;
  readonly unshieldedKeystore: UnshieldedKeystore;
}

export const startWallet = async (role: string, seedHex: string): Promise<WalletContext> => {
  const keys = deriveKeys(seedHex);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], NETWORK_ID);

  const connection = { indexerHttpUrl: PREPROD.walletIndexer, indexerWsUrl: PREPROD.walletIndexerWS };
  const wallet = await WalletFacade.init({
    configuration: {
      networkId: NETWORK_ID,
      indexerClientConnection: connection,
      provingServerUrl: new URL(PREPROD.proofServer),
      relayURL: new URL(PREPROD.node.replace(/^http/, 'ws')),
      txHistoryStorage: new InMemoryTransactionHistoryStorage(),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { role, wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const syncedState = (ctx: WalletContext) =>
  Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));

export interface Balances {
  readonly night: bigint;
  readonly dust: bigint;
  readonly unregisteredNightUtxos: number;
}

export const balances = async (ctx: WalletContext): Promise<Balances> => {
  const state = await syncedState(ctx);
  return {
    night: state.unshielded.balances[unshieldedToken().raw] ?? 0n,
    dust: state.dust.balance(new Date()),
    unregisteredNightUtxos: state.unshielded.availableCoins.filter(
      (coin: { meta?: { registeredForDustGeneration?: boolean } }) => coin.meta?.registeredForDustGeneration !== true,
    ).length,
  };
};

/** NIGHT only generates DUST (the fee token) after its UTXOs are registered on-chain. */
export const ensureDust = async (ctx: WalletContext, log: (msg: string) => void, timeoutMs = 15 * 60_000): Promise<bigint> => {
  const state = await syncedState(ctx);
  if (state.dust.balance(new Date()) > 0n) return state.dust.balance(new Date());

  const unregistered = state.unshielded.availableCoins.filter(
    (coin: { meta?: { registeredForDustGeneration?: boolean } }) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (unregistered.length > 0) {
    log(`registering ${unregistered.length} NIGHT UTXO(s) for DUST generation`);
    const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      ctx.unshieldedKeystore.getPublicKey(),
      (payload) => ctx.unshieldedKeystore.signData(payload),
    );
    await ctx.wallet.submitTransaction(await ctx.wallet.finalizeRecipe(recipe));
  }
  log('waiting for DUST to accrue');
  return Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) => s.dust.balance(new Date())),
      Rx.filter((dust) => dust > 0n),
      Rx.timeout(timeoutMs),
    ),
  );
};

/**
 * Signs unshielded offers with the right proof marker. Works around a wallet SDK bug where signRecipe hardcodes
 * 'pre-proof', which fails for proven intents.
 */
const signTransactionIntents = (
  tx: { intents?: Map<number, ledger.Intent<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>> },
  sign: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      proofMarker,
      'pre-binding',
      intent.serialize(),
    );
    const signature = sign(cloned.signatureData(segment));
    if (cloned.fallibleUnshieldedOffer) {
      const offer = cloned.fallibleUnshieldedOffer;
      cloned.fallibleUnshieldedOffer = offer.addSignatures(offer.inputs.map((_, i) => offer.signatures.at(i) ?? signature));
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const offer = cloned.guaranteedUnshieldedOffer;
      cloned.guaranteedUnshieldedOffer = offer.addSignatures(offer.inputs.map((_, i) => offer.signatures.at(i) ?? signature));
    }
    tx.intents.set(segment, cloned);
  }
};

export type Stage = 'proving' | 'balancing' | 'submitting';

export const providersFor = async (ctx: WalletContext, onStage: (stage: Stage) => void): Promise<VeilClaimProviders> => {
  const state = await syncedState(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<VeilClaimCircuitId>(ZK_CONFIG_PATH);
  const proofProvider = httpClientProofProvider(PREPROD.proofServer, zkConfigProvider);

  const walletProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      onStage('balancing');
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60_000) },
      );
      const sign = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction as never, sign, 'proof');
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction as never, sign, 'pre-proof');
      return ctx.wallet.finalizeRecipe(recipe);
    },
    async submitTx(tx) {
      onStage('submitting');
      return (await ctx.wallet.submitTransaction(tx)) as never;
    },
  };

  return {
    privateStateProvider: inMemoryPrivateStateProvider<VeilClaimPrivateStateId, VeilClaimPrivateState>(),
    publicDataProvider: indexerPublicDataProvider(PREPROD.indexer, PREPROD.indexerWS, RuntimeWebSocket),
    zkConfigProvider,
    proofProvider: {
      proveTx: (tx, config) => {
        onStage('proving');
        return proofProvider.proveTx(tx, config);
      },
    },
    walletProvider,
    midnightProvider: walletProvider,
  };
};

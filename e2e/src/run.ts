/**
 * End-to-end VeilClaim run on Preprod with three wallets and the local proof server.
 *
 *   bun run e2e status        sync wallets, show balances, register NIGHT for DUST
 *   bun run e2e               full scenario on the saved contract (deploys one if none)
 *   bun run e2e -- --fresh    full scenario on a newly deployed contract
 *
 * Writes only public facts (addresses, transaction ids, block heights, timings) to deployments/preprod.json.
 * The admin secret for the deployed contract stays in the gitignored e2e/.state/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  HEALTH_COVER_A,
  MED_01,
  type TxReceipt,
  VeilClaimAPI,
  type VeilClaimPublicState,
  contractRejection,
  epochDay,
  toPublicState,
} from '@veilclaim/api';
import { type PrivateClaim, VeilClaim, providerKeyPairFromSecret, signCredential } from '@veilclaim/contract';
import { type Stage, type WalletContext, balances, ensureDust, providersFor, startWallet, syncedState } from './wallet.js';
import { NETWORK_ID, ROLES, type WalletRole, loadOrCreateSeeds, unshieldedAddress } from './wallets.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const STATE_PATH = resolve(ROOT, 'e2e', '.state', 'preprod.json');
const EVIDENCE_PATH = resolve(ROOT, 'deployments', 'preprod.json');
const PROVIDER_SECRET_PATH = resolve(ROOT, '.provider-secret');

const args = process.argv.slice(2);
const mode = args.includes('status') ? 'status' : 'scenario';
const fresh = args.includes('--fresh');

const started = Date.now();
const log = (scope: string, message: string) => {
  const t = ((Date.now() - started) / 1000).toFixed(0).padStart(4);
  console.log(`[${t}s] ${scope.padEnd(8)} ${message}`);
};

const formatNight = (v: bigint) => (Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ── Evidence ───────────────────────────────────────────────────────────

interface StepRecord {
  step: string;
  wallet: WalletRole;
  outcome: 'accepted' | 'rejected as expected' | 'UNEXPECTED';
  detail?: string;
  receipt?: TxReceipt;
  totalSeconds: number;
  proofSeconds?: number;
}

const steps: StepRecord[] = [];

// ── Setup ──────────────────────────────────────────────────────────────

setNetworkId(NETWORK_ID);
const seeds = loadOrCreateSeeds();

log('wallets', 'starting and syncing admin, alice and bob (first sync can take several minutes)');
const wallets = Object.fromEntries(
  await Promise.all(ROLES.map(async (role) => [role, await startWallet(role, seeds[role])] as const)),
) as Record<WalletRole, WalletContext>;

await Promise.all(
  ROLES.map(async (role) => {
    await syncedState(wallets[role]);
    const b = await balances(wallets[role]);
    log(role, `synced · ${formatNight(b.night)} tNIGHT · ${b.dust} DUST · ${b.unregisteredNightUtxos} unregistered UTXO(s)`);
  }),
);

const unfunded: WalletRole[] = [];
for (const role of ROLES) if ((await balances(wallets[role])).night === 0n) unfunded.push(role);
if (unfunded.length > 0) {
  console.log('\nThese wallets have no tNIGHT yet. Fund them at https://faucet.preprod.midnight.network/ and rerun:\n');
  for (const role of unfunded) console.log(`  ${role.padEnd(6)} ${unshieldedAddress(seeds[role])}`);
  await shutdown(2);
}

await Promise.all(
  ROLES.map(async (role) => {
    const dust = await ensureDust(wallets[role], (m) => log(role, m));
    log(role, `DUST ready: ${dust}`);
  }),
);

if (mode === 'status') await shutdown(0);

// ── Scenario ───────────────────────────────────────────────────────────

const stageTimer = () => {
  let provingAt = 0;
  let proofSeconds: number | undefined;
  const onStage = (stage: Stage) => {
    if (stage === 'proving') provingAt = Date.now();
    if (stage === 'balancing' && provingAt) proofSeconds = (Date.now() - provingAt) / 1000;
  };
  return { onStage, proofSeconds: () => proofSeconds };
};

const apis = {} as Record<WalletRole, VeilClaimAPI>;
const timers = {} as Record<WalletRole, ReturnType<typeof stageTimer>>;

const saved = existsSync(STATE_PATH) && !fresh ? (JSON.parse(readFileSync(STATE_PATH, 'utf8')) as { contractAddress: string; adminSecret: string }) : null;
const adminSecret = saved ? Buffer.from(saved.adminSecret, 'hex') : crypto.getRandomValues(new Uint8Array(32));

for (const role of ROLES) {
  timers[role] = stageTimer();
}

const run = async (step: string, wallet: WalletRole, action: () => Promise<TxReceipt>, expectRejection?: string) => {
  const t0 = Date.now();
  log(wallet, `${step}…`);
  try {
    const receipt = await action();
    const record: StepRecord = {
      step,
      wallet,
      outcome: expectRejection ? 'UNEXPECTED' : 'accepted',
      detail: expectRejection ? `expected rejection "${expectRejection}" but the transaction was accepted` : undefined,
      receipt,
      totalSeconds: (Date.now() - t0) / 1000,
      proofSeconds: timers[wallet].proofSeconds(),
    };
    steps.push(record);
    log(wallet, `${record.outcome} · tx ${receipt.txId} · block ${receipt.blockHeight} · ${record.totalSeconds.toFixed(0)}s (proof ${record.proofSeconds?.toFixed(0) ?? '?'}s)`);
  } catch (err) {
    const reason = contractRejection(err);
    const message = err instanceof Error ? err.message : String(err);
    const ok = !!expectRejection && !!reason && message.includes(expectRejection);
    steps.push({ step, wallet, outcome: ok ? 'rejected as expected' : 'UNEXPECTED', detail: reason ?? message, totalSeconds: (Date.now() - t0) / 1000 });
    log(wallet, `${ok ? 'rejected as expected' : 'UNEXPECTED ERROR'} · ${reason ?? message}`);
  }
};

if (!existsSync(PROVIDER_SECRET_PATH)) {
  console.error('Missing .provider-secret. Run `bun run demo:issue` first.');
  await shutdown(1);
}
const provider = providerKeyPairFromSecret(BigInt(readFileSync(PROVIDER_SECRET_PATH, 'utf8').trim()));

for (const role of ROLES) {
  const providers = await providersFor(wallets[role], timers[role].onStage);
  if (role === 'admin') {
    if (saved) {
      apis.admin = await VeilClaimAPI.join(providers, saved.contractAddress);
      log('admin', `joined saved contract ${saved.contractAddress}`);
    } else {
      await run('deploy', 'admin', async () => {
        apis.admin = await VeilClaimAPI.deploy(providers, adminSecret);
        mkdirSync(dirname(STATE_PATH), { recursive: true });
        writeFileSync(STATE_PATH, `${JSON.stringify({ contractAddress: apis.admin.contractAddress, adminSecret: toHex(adminSecret) }, null, 2)}\n`, { mode: 0o600 });
        log('admin', `contract ${apis.admin.contractAddress}`);
        return apis.admin.deployReceipt;
      });
      if (!apis.admin) await shutdown(1);
    }
  } else {
    apis[role] = await VeilClaimAPI.join(providers, apis.admin.contractAddress);
  }
}

const contractAddress = apis.admin.contractAddress;

const readLedger = async (): Promise<VeilClaimPublicState> => {
  const providers = await providersFor(wallets.admin, () => {});
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) throw new Error('Contract state not found on the indexer');
  return toPublicState(VeilClaim.ledger(state.data));
};

let ledgerState = await readLedger();

if (!ledgerState.policies.some((p) => p.policyId === toHex(HEALTH_COVER_A.policyId))) {
  await run('create policy “Health Cover A”', 'admin', () => apis.admin.createPolicy(adminSecret, HEALTH_COVER_A));
}
const med01 = ledgerState.providers.find((p) => p.providerId === toHex(MED_01.providerId));
if (!med01?.approved || med01.attestationKey.x !== provider.attestationKey.x) {
  await run('approve Med-01', 'admin', () => apis.admin.setProviderStatus(adminSecret, MED_01.providerId, provider.attestationKey, true));
}

ledgerState = await readLedger();
const countBefore = ledgerState.acceptedClaimCount;
log('ledger', `accepted claims before scenario: ${countBefore}`);

const issueClaim = (billedAmount: bigint, serviceDate: string): PrivateClaim => {
  const holderSecret = crypto.getRandomValues(new Uint8Array(32));
  const credential = {
    holderCommitment: VeilClaim.pureCircuits.deriveHolderCommitment(holderSecret),
    providerId: MED_01.providerId,
    policyId: HEALTH_COVER_A.policyId,
    categoryCode: HEALTH_COVER_A.coveredCategory,
    serviceEpoch: epochDay(serviceDate),
    billedAmount,
    claimNonce: crypto.getRandomValues(new Uint8Array(32)),
  };
  return { holderSecret, credential, attestation: signCredential(provider, credential) };
};

const aliceClaim = issueClaim(280_000n, '2026-08-20');
const bobOverCap = issueClaim(700_000n, '2026-08-22');
const bobClaim = issueClaim(120_000n, '2026-09-01');

await run('alice submits a valid 280,000 claim', 'alice', () => apis.alice.submitClaim(aliceClaim));
await run('alice replays the same claim', 'alice', () => apis.alice.submitClaim(aliceClaim), 'claim already consumed');
await run('bob submits a 700,000 claim over the cap', 'bob', () => apis.bob.submitClaim(bobOverCap), 'amount exceeds policy cap');
await run('bob submits a valid 120,000 claim', 'bob', () => apis.bob.submitClaim(bobClaim));
await run(
  'bob presents alice’s claim with his own secret',
  'bob',
  () => apis.bob.submitClaim({ ...aliceClaim, holderSecret: crypto.getRandomValues(new Uint8Array(32)) }),
  'holder binding failed',
);

ledgerState = await readLedger();
const accepted = steps.filter((s) => s.outcome === 'accepted' && s.step.includes('claim')).length;
const countOk = ledgerState.acceptedClaimCount === countBefore + BigInt(accepted);
log('ledger', `accepted claims after scenario: ${ledgerState.acceptedClaimCount} (${countOk ? 'matches' : 'DOES NOT MATCH'} ${accepted} accepted)`);

// ── Evidence and summary ───────────────────────────────────────────────

const evidencePrev = existsSync(EVIDENCE_PATH) ? (JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) as { runs?: unknown[] }) : null;
const evidence = {
  network: NETWORK_ID,
  contractAddress,
  wallets: Object.fromEntries(ROLES.map((role) => [role, unshieldedAddress(seeds[role])])),
  ledger: {
    acceptedClaimCount: ledgerState.acceptedClaimCount.toString(),
    consumedClaimNullifiers: ledgerState.consumedClaimNullifiers,
    claimReceipts: ledgerState.claimReceipts.map((r) => ({ index: r.index.toString(), policyId: r.policyId, claimNullifier: r.claimNullifier })),
  },
  runs: [
    ...((evidencePrev?.runs as unknown[]) ?? []),
    { at: new Date().toISOString(), proofServer: 'local', steps },
  ],
};
mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

const failures = steps.filter((s) => s.outcome === 'UNEXPECTED');
console.log(`\n${'─'.repeat(72)}`);
for (const s of steps) console.log(`${s.outcome === 'UNEXPECTED' ? '✗' : '✓'} ${s.wallet.padEnd(6)} ${s.step} → ${s.outcome}${s.detail ? ` (${s.detail})` : ''}`);
console.log(`${'─'.repeat(72)}\nContract ${contractAddress}\nEvidence written to ${EVIDENCE_PATH}`);
await shutdown(failures.length === 0 && countOk ? 0 : 1);

async function shutdown(code: number): Promise<never> {
  await Promise.allSettled(Object.values(wallets ?? {}).map((w) => w.wallet.stop()));
  process.exit(code);
}

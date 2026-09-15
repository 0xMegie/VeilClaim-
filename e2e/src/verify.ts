/**
 * Independently checks a VeilClaim deployment against Midnight's public Preprod indexer. No wallet, no keys.
 *
 *   bun run e2e:verify                 verifies deployments/preprod.json
 *   bun run e2e:verify <address>       prints the public ledger of any VeilClaim contract
 *
 * Reads the contract's current ledger, then looks up every recorded transaction by hash and confirms it is
 * finalized on-chain in the recorded block. Exits non-zero on any mismatch.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { type TxReceipt, toPublicState } from '@veilclaim/api';
import { VeilClaim } from '@veilclaim/contract';
import { PREPROD } from './wallet.js';
import { NETWORK_ID } from './wallets.js';

const EVIDENCE_PATH = resolve(import.meta.dirname, '..', '..', 'deployments', 'preprod.json');

/** Either the e2e runner's evidence file or the Dev tab's copied deployment record. */
interface Evidence {
  contractAddress: string;
  ledger?: { acceptedClaimCount: string; consumedClaimNullifiers: string[] };
  runs?: { steps: { step: string; outcome: string; receipt?: TxReceipt }[] }[];
  transactions?: ({ action: string } & TxReceipt)[];
}

const arg = process.argv[2];
const evidence = !arg && existsSync(EVIDENCE_PATH) ? (JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) as Evidence) : null;
const contractAddress = arg ?? evidence?.contractAddress;
if (!contractAddress) {
  console.error('Usage: bun run e2e:verify [contractAddress]   (or record a deployment in deployments/preprod.json first)');
  process.exit(1);
}

setNetworkId(NETWORK_ID);
const problems: string[] = [];
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) problems.push(label);
};

// ── Ledger ─────────────────────────────────────────────────────────────

const publicData = indexerPublicDataProvider(PREPROD.indexer, PREPROD.indexerWS, globalThis.WebSocket as never);
const contractState = await publicData.queryContractState(contractAddress);
if (!contractState) {
  console.error(`No contract found at ${contractAddress} on ${NETWORK_ID}`);
  process.exit(1);
}
const ledger = toPublicState(VeilClaim.ledger(contractState.data));

console.log(`Contract ${contractAddress} on ${NETWORK_ID}\n`);
for (const p of ledger.policies) {
  console.log(
    `policy   ${p.policyId.slice(0, 16)}…  ${p.active ? 'active' : 'inactive'} · category ${p.coveredCategory} · cap ${p.maxAmount} · days ${p.validFromEpoch}–${p.validUntilEpoch}`,
  );
}
for (const p of ledger.providers) console.log(`provider ${p.providerId.slice(0, 16)}…  ${p.approved ? 'approved' : 'revoked'}`);
console.log(`accepted claims  ${ledger.acceptedClaimCount}`);
for (const r of ledger.claimReceipts) console.log(`receipt #${r.index}  policy ${r.policyId.slice(0, 16)}…  nullifier ${r.claimNullifier}`);
console.log('');

check(ledger.claimReceipts.length === ledger.consumedClaimNullifiers.length, 'every receipt is paired with a consumed nullifier');
check(
  ledger.claimReceipts.every((r) => ledger.consumedClaimNullifiers.includes(r.claimNullifier)),
  'every receipt nullifier is in the consumed set',
);
check(BigInt(ledger.claimReceipts.length) === ledger.acceptedClaimCount, 'accepted claim count equals the number of receipts');

if (!evidence) process.exit(problems.length ? 1 : 0);

if (evidence.ledger) {
  check(BigInt(evidence.ledger.acceptedClaimCount) <= ledger.acceptedClaimCount, 'recorded claim count is on the ledger');
  check(
    evidence.ledger.consumedClaimNullifiers.every((n) => ledger.consumedClaimNullifiers.includes(n)),
    'recorded nullifiers are on the ledger',
  );
}

// ── Transactions ───────────────────────────────────────────────────────

const TX_QUERY = `query ($hash: HexEncoded!) {
  transactions(offset: { hash: $hash }) {
    hash
    block { height timestamp }
    ... on RegularTransaction { transactionResult { status } }
  }
}`;

const lookupTx = async (hash: string) => {
  const res = await fetch(PREPROD.indexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: TX_QUERY, variables: { hash } }),
  });
  const body = (await res.json()) as {
    data?: { transactions: { hash: string; block: { height: number }; transactionResult?: { status: string } }[] };
  };
  return body.data?.transactions[0] ?? null;
};

const recorded = [
  ...(evidence.transactions ?? []).map(({ action, ...receipt }) => ({ step: action, receipt })),
  ...(evidence.runs ?? []).flatMap((r) => r.steps.filter((s) => s.outcome === 'accepted' && s.receipt)),
];
console.log('');
for (const { step, receipt } of recorded) {
  if (!receipt) continue;
  const tx = await lookupTx(receipt.txHash);
  const status = tx?.transactionResult?.status ?? 'not found';
  check(
    !!tx && tx.block.height === receipt.blockHeight && status === 'SUCCESS',
    `${step}: tx ${receipt.txHash.slice(0, 16)}… in block ${tx?.block.height ?? '?'} (${status})`,
  );
}

console.log(problems.length ? `\n${problems.length} check(s) failed` : '\nAll checks passed against the public indexer.');
process.exit(problems.length ? 1 : 0);

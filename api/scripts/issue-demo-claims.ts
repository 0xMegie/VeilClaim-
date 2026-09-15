/**
 * Plays the controlled demo provider (Med-01): signs sample claim credentials for one demo holder.
 *
 *   bun run demo:issue
 *
 * The provider's signing key stays in the gitignored `.provider-secret` at the repo root; only its public
 * attestation key and the signed claims are written to ui/src/demo/claims.json, so the claimant app can
 * present claims but cannot forge them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  JUBJUB_ORDER,
  type PrivateClaim,
  VeilClaim,
  generateProviderKeyPair,
  providerKeyPairFromSecret,
  signCredential,
} from '@veilclaim/contract';
import { encodeClaim } from '../src/claim-codec.js';
import { HEALTH_COVER_A, MED_01 } from '../src/demo.js';
import { epochDay } from '../src/encoding.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const secretPath = resolve(root, '.provider-secret');
const outPath = resolve(root, 'ui', 'src', 'demo', 'claims.json');

const loadProvider = () => {
  if (existsSync(secretPath)) {
    return providerKeyPairFromSecret(BigInt(readFileSync(secretPath, 'utf8').trim()));
  }
  const keys = generateProviderKeyPair();
  writeFileSync(secretPath, `0x${keys.secretKey.toString(16)}\n`, { mode: 0o600 });
  console.log(`Created provider signing key at ${secretPath} (gitignored).`);
  return keys;
};

const provider = loadProvider();
if (provider.secretKey >= JUBJUB_ORDER) throw new Error('Provider secret out of range.');

const holderSecret = crypto.getRandomValues(new Uint8Array(32));
const holderCommitment = VeilClaim.pureCircuits.deriveHolderCommitment(holderSecret);

const issue = (billedAmount: bigint, serviceDate: string): PrivateClaim => {
  const credential = {
    holderCommitment,
    providerId: MED_01.providerId,
    policyId: HEALTH_COVER_A.policyId,
    categoryCode: HEALTH_COVER_A.coveredCategory,
    serviceEpoch: epochDay(serviceDate),
    billedAmount,
    claimNonce: crypto.getRandomValues(new Uint8Array(32)),
  };
  return { holderSecret, credential, attestation: signCredential(provider, credential) };
};

const demo = {
  provider: {
    name: MED_01.name,
    providerId: toHex(MED_01.providerId),
    attestationKey: { x: provider.attestationKey.x.toString(), y: provider.attestationKey.y.toString() },
  },
  claims: [
    { id: 'valid-280k', label: 'Valid claim · 280,000', serviceDate: '2026-08-20', claim: encodeClaim(issue(280_000n, '2026-08-20')) },
    { id: 'over-cap-700k', label: 'Over cap · 700,000', serviceDate: '2026-08-22', claim: encodeClaim(issue(700_000n, '2026-08-22')) },
  ],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(demo, null, 2)}\n`);
console.log(`Wrote ${demo.claims.length} signed demo claims to ${outPath}`);

import { expect } from 'vitest';
import { type ProviderKeyPair, providerKeyPairFromSecret, signCredential } from '../src/attestation.js';
import { type ClaimCredential, type ProviderAttestation, pureCircuits } from '../src/managed/veilclaim/contract/index.js';
import { VeilClaimSimulator, bytes32, snapshot } from './simulator.js';

export const ADMIN = bytes32('admin-secret');
export const POLICY = bytes32('health-cover-a');
export const OTHER_POLICY = bytes32('health-cover-b');
export const MED_01 = bytes32('med-01');
export const MED_02 = bytes32('med-02');
export const MED_01_KEYS = providerKeyPairFromSecret(0x5eed01n);
export const MED_02_KEYS = providerKeyPairFromSecret(0x5eed02n);
export const HOLDER = bytes32('holder-alice');

/** Policy window is epochs 100–200 inclusive, category 4, cap 500,000. */
export const TERMS = { from: 100n, until: 200n, category: 4n, cap: 500_000n } as const;

export const credential = (overrides: Partial<ClaimCredential> = {}): ClaimCredential => ({
  holderCommitment: pureCircuits.deriveHolderCommitment(HOLDER),
  providerId: MED_01,
  policyId: POLICY,
  categoryCode: 4n,
  serviceEpoch: 150n,
  billedAmount: 280_000n,
  claimNonce: bytes32('claim-0001'),
  ...overrides,
});

export interface Claim {
  holderSecret: Uint8Array;
  credential: ClaimCredential;
  attestation: ProviderAttestation;
}

export const signedClaim = (cred: ClaimCredential = credential(), keys: ProviderKeyPair = MED_01_KEYS): Claim => ({
  holderSecret: HOLDER,
  credential: cred,
  attestation: signCredential(keys, cred),
});

/** A deployed contract with Health Cover A and an approved Med-01. */
export const setup = (): VeilClaimSimulator => {
  const sim = new VeilClaimSimulator(ADMIN);
  sim.as({ adminSecret: ADMIN });
  sim.createPolicy(POLICY, TERMS.from, TERMS.until, TERMS.category, TERMS.cap);
  sim.setProviderStatus(MED_01, MED_01_KEYS.attestationKey, true);
  return sim;
};

export const submit = (sim: VeilClaimSimulator, claim: Claim, policyId: Uint8Array = claim.credential.policyId) =>
  sim.as(claim).submitClaim(policyId);

/** Asserts the action fails with `message` and leaves every part of the public ledger untouched. */
export const expectRejected = (sim: VeilClaimSimulator, action: () => unknown, message: string): void => {
  const before = snapshot(sim.ledger);
  expect(action).toThrow(message);
  expect(snapshot(sim.ledger)).toEqual(before);
};

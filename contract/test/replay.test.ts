import { describe, expect, it } from 'vitest';
import { signCredential } from '../src/attestation.js';
import {
  ADMIN,
  type Claim,
  MED_01_KEYS,
  OTHER_POLICY,
  TERMS,
  credential,
  expectRejected,
  setup,
  signedClaim,
  submit,
} from './fixtures.js';
import { bytes32 } from './simulator.js';

const CONSUMED = 'VeilClaim: claim already consumed';

describe('replay protection', () => {
  it('rejects an identical resubmission', () => {
    const sim = setup();
    const claim = signedClaim();
    submit(sim, claim);
    expectRejected(sim, () => submit(sim, claim), CONSUMED);
  });

  it('rejects the same claim re-signed with a fresh attestation', () => {
    const sim = setup();
    const claim = signedClaim();
    submit(sim, claim);
    const resigned: Claim = { ...claim, attestation: signCredential(MED_01_KEYS, claim.credential) };
    expect(resigned.attestation.s).not.toBe(claim.attestation.s);
    expectRejected(sim, () => submit(sim, resigned), CONSUMED);
  });

  it('rejects the same claim from a fresh session', () => {
    const sim = setup();
    const claim = signedClaim();
    submit(sim, claim);
    const freshSession: Claim = structuredClone(claim);
    expectRejected(sim, () => submit(sim, freshSession), CONSUMED);
  });

  it('accepts a separate legitimate claim with its own nonce', () => {
    const sim = setup();
    submit(sim, signedClaim());
    const l = submit(sim, signedClaim(credential({ claimNonce: bytes32('claim-0002') })));
    expect(l.acceptedClaimCount).toBe(2n);
    expect(l.consumedClaimNullifiers.size()).toBe(2n);
    expect(l.claimReceipts.size()).toBe(2n);
  });

  it('rejects a credential submitted against a policy it was not issued for', () => {
    const sim = setup();
    sim.as({ adminSecret: ADMIN }).createPolicy(OTHER_POLICY, TERMS.from, TERMS.until, TERMS.category, TERMS.cap);
    submit(sim, signedClaim());
    expectRejected(sim, () => submit(sim, signedClaim(), OTHER_POLICY), 'VeilClaim: credential is for another policy');
  });

  it('rejects re-scoping a consumed claim to another policy by editing its policy id', () => {
    const sim = setup();
    sim.as({ adminSecret: ADMIN }).createPolicy(OTHER_POLICY, TERMS.from, TERMS.until, TERMS.category, TERMS.cap);
    const claim = signedClaim();
    submit(sim, claim);
    const rescoped: Claim = { ...claim, credential: { ...claim.credential, policyId: OTHER_POLICY } };
    expectRejected(sim, () => submit(sim, rescoped), 'VeilClaim: invalid provider attestation');
  });
});

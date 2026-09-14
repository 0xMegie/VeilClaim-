import { describe, expect, it } from 'vitest';
import { JUBJUB_ORDER } from '../src/attestation.js';
import { POLICY, credential, expectRejected, setup, signedClaim, submit } from './fixtures.js';
import { bytes32 } from './simulator.js';

describe('submitClaim', () => {
  it('accepts a valid provider-attested claim and records nullifier, receipt and count together', () => {
    const sim = setup();
    const l = submit(sim, signedClaim());

    expect(l.acceptedClaimCount).toBe(1n);
    expect(l.consumedClaimNullifiers.size()).toBe(1n);
    const receipt = l.claimReceipts.lookup(0n);
    expect(receipt.policyId).toEqual(POLICY);
    expect(l.consumedClaimNullifiers.member(receipt.claimNullifier)).toBe(true);
  });

  it('rejects a claim above the policy cap and leaves the ledger unchanged', () => {
    const sim = setup();
    const overCap = signedClaim(credential({ billedAmount: 700_000n }));
    expectRejected(sim, () => submit(sim, overCap), 'VeilClaim: amount exceeds policy cap');
  });

  it('verifies TypeScript attestations in-circuit across many fresh nonces', () => {
    const sim = setup();
    for (let i = 0; i < 12; i++) {
      const claim = signedClaim(credential({ claimNonce: bytes32(`nonce-sweep-${i}`) }));
      expect(claim.attestation.s).toBeLessThan(JUBJUB_ORDER);
      submit(sim, claim);
    }
    expect(sim.ledger.acceptedClaimCount).toBe(12n);
  });
});

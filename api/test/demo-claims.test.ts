import { VeilClaimSimulator, bytes32 } from '@veilclaim/contract/testing';
import { describe, expect, it } from 'vitest';
import demo from '../../ui/src/demo/claims.json';
import { decodeClaim, encodeClaim } from '../src/claim-codec.js';
import { HEALTH_COVER_A, MED_01 } from '../src/demo.js';

// The signed claims the app ships must be accepted or rejected by the real contract exactly as the demo script says.

const ADMIN = bytes32('demo-admin');
const claimById = (id: string) => decodeClaim(demo.claims.find((c) => c.id === id)!.claim);

const deployDemo = () => {
  const sim = new VeilClaimSimulator(ADMIN).as({ adminSecret: ADMIN });
  const p = HEALTH_COVER_A;
  sim.createPolicy(p.policyId, p.validFromEpoch, p.validUntilEpoch, p.coveredCategory, p.maxAmount);
  const key = { x: BigInt(demo.provider.attestationKey.x), y: BigInt(demo.provider.attestationKey.y) };
  sim.setProviderStatus(MED_01.providerId, key, true);
  return sim;
};

describe('shipped demo claims', () => {
  it('round-trips through the JSON codec', () => {
    const claim = claimById('valid-280k');
    expect(decodeClaim(encodeClaim(claim))).toEqual(claim);
  });

  it('accepts the 280,000 claim under Health Cover A', () => {
    const sim = deployDemo();
    const claim = claimById('valid-280k');
    expect(sim.as(claim).submitClaim(claim.credential.policyId).acceptedClaimCount).toBe(1n);
  });

  it('rejects an exact replay of the 280,000 claim', () => {
    const sim = deployDemo();
    const claim = claimById('valid-280k');
    sim.as(claim).submitClaim(claim.credential.policyId);
    expect(() => sim.as(claim).submitClaim(claim.credential.policyId)).toThrow('VeilClaim: claim already consumed');
  });

  it('denies the 700,000 claim on the policy cap', () => {
    const sim = deployDemo();
    const claim = claimById('over-cap-700k');
    expect(() => sim.as(claim).submitClaim(claim.credential.policyId)).toThrow('VeilClaim: amount exceeds policy cap');
    expect(sim.ledger.acceptedClaimCount).toBe(0n);
  });
});

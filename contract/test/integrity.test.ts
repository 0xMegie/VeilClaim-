import { describe, it } from 'vitest';
import { pureCircuits } from '../src/managed/veilclaim/contract/index.js';
import { type Claim, credential, expectRejected, setup, signedClaim, submit } from './fixtures.js';
import { bytes32 } from './simulator.js';

// The provider signed the original values; the claimant presents altered ones.
const tamper = (overrides: Partial<Claim['credential']>): Claim => {
  const genuine = signedClaim();
  return { ...genuine, credential: { ...genuine.credential, ...overrides } };
};

const INVALID = 'VeilClaim: invalid provider attestation';

describe('credential integrity', () => {
  it('rejects a tampered amount, even a lower one', () => {
    const sim = setup();
    expectRejected(sim, () => submit(sim, tamper({ billedAmount: 100_000n })), INVALID);
  });

  it('rejects a tampered category', () => {
    const sim = setup();
    // Sign a category-5 claim, then present it as the covered category 4.
    const genuine = signedClaim(credential({ categoryCode: 5n }));
    const altered = { ...genuine, credential: { ...genuine.credential, categoryCode: 4n } };
    expectRejected(sim, () => submit(sim, altered), INVALID);
  });

  it('rejects a tampered service date', () => {
    const sim = setup();
    expectRejected(sim, () => submit(sim, tamper({ serviceEpoch: 151n })), INVALID);
  });

  it('rejects a tampered claim nonce', () => {
    const sim = setup();
    expectRejected(sim, () => submit(sim, tamper({ claimNonce: bytes32('claim-9999') })), INVALID);
  });

  it('rejects the right credential presented with the wrong holder secret', () => {
    const sim = setup();
    const stolen: Claim = { ...signedClaim(), holderSecret: bytes32('holder-mallory') };
    expectRejected(sim, () => submit(sim, stolen), 'VeilClaim: holder binding failed');
  });

  it('rejects a stolen credential re-bound to the thief’s own holder secret', () => {
    const sim = setup();
    const mallory = bytes32('holder-mallory');
    const rebound: Claim = {
      ...tamper({ holderCommitment: pureCircuits.deriveHolderCommitment(mallory) }),
      holderSecret: mallory,
    };
    expectRejected(sim, () => submit(sim, rebound), INVALID);
  });
});

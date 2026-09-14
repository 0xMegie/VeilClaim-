import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, POLICY, TERMS, expectRejected, setup, signedClaim, submit } from './fixtures.js';
import { VeilClaimSimulator, bytes32 } from './simulator.js';

describe('policy', () => {
  let sim: VeilClaimSimulator;

  beforeEach(() => {
    sim = new VeilClaimSimulator(ADMIN).as({ adminSecret: ADMIN });
  });

  it('starts with an empty public ledger', () => {
    const l = sim.ledger;
    expect(l.policies.isEmpty()).toBe(true);
    expect(l.providers.isEmpty()).toBe(true);
    expect(l.consumedClaimNullifiers.isEmpty()).toBe(true);
    expect(l.claimReceipts.isEmpty()).toBe(true);
    expect(l.acceptedClaimCount).toBe(0n);
  });

  it('admin creates a valid policy', () => {
    const l = sim.createPolicy(POLICY, TERMS.from, TERMS.until, TERMS.category, TERMS.cap);
    expect(l.policies.lookup(POLICY)).toEqual({
      active: true,
      validFromEpoch: 100n,
      validUntilEpoch: 200n,
      coveredCategory: 4n,
      maxAmount: 500_000n,
    });
  });

  it('accepts a single-epoch window', () => {
    const l = sim.createPolicy(POLICY, 150n, 150n, TERMS.category, TERMS.cap);
    expect(l.policies.member(POLICY)).toBe(true);
  });

  it('rejects a caller without the admin secret', () => {
    sim.as({ adminSecret: bytes32('attacker') });
    expectRejected(sim, () => sim.createPolicy(POLICY, TERMS.from, TERMS.until, TERMS.category, TERMS.cap), 'VeilClaim: not admin');
  });

  it('rejects a window that ends before it starts', () => {
    expectRejected(sim, () => sim.createPolicy(POLICY, 201n, 200n, TERMS.category, TERMS.cap), 'VeilClaim: invalid policy interval');
  });

  it('rejects a zero cap', () => {
    expectRejected(sim, () => sim.createPolicy(POLICY, TERMS.from, TERMS.until, TERMS.category, 0n), 'VeilClaim: invalid cap');
  });

  it('rejects overwriting an existing policy', () => {
    sim.createPolicy(POLICY, TERMS.from, TERMS.until, TERMS.category, TERMS.cap);
    expectRejected(sim, () => sim.createPolicy(POLICY, 0n, 999n, TERMS.category, 9_999_999n), 'VeilClaim: policy exists');
  });

  it('rejects a claim against a policy that does not exist', () => {
    const deployed = setup();
    expectRejected(deployed, () => submit(deployed, signedClaim(), bytes32('no-such-policy')), 'VeilClaim: unknown policy');
  });
});

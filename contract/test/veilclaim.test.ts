import { ecMulGenerator } from '@midnight-ntwrk/compact-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { VeilClaimSimulator, bytes32 } from './simulator.js';

// Scaffold smoke tests. The doc.md §15 suite (40 tests) grows from here.

const ADMIN = bytes32('admin-secret');
const POLICY = bytes32('health-cover-a');
const PROVIDER = bytes32('med-01');
const PROVIDER_KEY = ecMulGenerator(123456789n);

describe('VeilClaim scaffold', () => {
  let sim: VeilClaimSimulator;

  beforeEach(() => {
    sim = new VeilClaimSimulator(ADMIN);
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
    const l = sim.as({ adminSecret: ADMIN }).createPolicy(POLICY, 100n, 200n, 4n, 500_000n);
    expect(l.policies.lookup(POLICY)).toEqual({
      active: true,
      validFromEpoch: 100n,
      validUntilEpoch: 200n,
      coveredCategory: 4n,
      maxAmount: 500_000n,
    });
  });

  it('rejects a policy from a caller without the admin secret', () => {
    sim.as({ adminSecret: bytes32('attacker') });
    expect(() => sim.createPolicy(POLICY, 100n, 200n, 4n, 500_000n)).toThrow('VeilClaim: not admin');
    expect(sim.ledger.policies.isEmpty()).toBe(true);
  });

  it('admin approves a provider', () => {
    const l = sim.as({ adminSecret: ADMIN }).setProviderStatus(PROVIDER, PROVIDER_KEY, true);
    expect(l.providers.lookup(PROVIDER)).toEqual({ attestationKey: PROVIDER_KEY, approved: true });
  });

  it('submitClaim fails closed until implemented', () => {
    sim.as({ adminSecret: ADMIN }).createPolicy(POLICY, 100n, 200n, 4n, 500_000n);
    expect(() => sim.as({}).submitClaim(POLICY)).toThrow('VeilClaim: submitClaim not implemented');
    expect(sim.ledger.acceptedClaimCount).toBe(0n);
  });
});

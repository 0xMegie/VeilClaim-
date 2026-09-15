import { describe, expect, it } from 'vitest';
import { type Claim, MED_02, MED_02_KEYS, POLICY, credential, setup, signedClaim, submit } from './fixtures.js';
import { bytes32, hex, snapshot } from './simulator.js';

describe('atomic claim consumption', () => {
  it('a successful claim adds exactly one nullifier, one receipt and one count, and changes nothing else', () => {
    const sim = setup();
    const before = snapshot(sim.ledger);
    const after = snapshot(submit(sim, signedClaim()));

    expect(after.acceptedClaimCount).toBe(before.acceptedClaimCount + 1n);
    expect(after.consumedClaimNullifiers).toHaveLength(before.consumedClaimNullifiers.length + 1);
    expect(after.claimReceipts).toHaveLength(before.claimReceipts.length + 1);
    expect({ ...after, acceptedClaimCount: 0n, consumedClaimNullifiers: [], claimReceipts: [] }).toEqual({
      ...before,
      acceptedClaimCount: 0n,
      consumedClaimNullifiers: [],
      claimReceipts: [],
    });
  });

  it('a claim failing at any check writes nothing', () => {
    const sim = setup();
    const accepted = signedClaim();
    submit(sim, accepted);
    const genuine = signedClaim(credential({ claimNonce: bytes32('claim-fresh') }));

    const failures: Array<[string, Claim, Uint8Array?]> = [
      ['unknown policy', genuine, bytes32('no-such-policy')],
      ['credential for another policy', signedClaim(credential({ policyId: bytes32('other') })), POLICY],
      ['unknown provider', signedClaim(credential({ providerId: MED_02 }), MED_02_KEYS)],
      ['bad attestation', { ...genuine, credential: { ...genuine.credential, billedAmount: 1n } }],
      ['wrong holder', { ...genuine, holderSecret: bytes32('holder-mallory') }],
      ['category', signedClaim(credential({ categoryCode: 9n }))],
      ['date', signedClaim(credential({ serviceEpoch: 999n }))],
      ['amount', signedClaim(credential({ billedAmount: 9_999_999n }))],
      ['replay', accepted],
    ];

    const baseline = snapshot(sim.ledger);
    for (const [name, claim, policyId] of failures) {
      expect(() => submit(sim, claim, policyId), name).toThrow('VeilClaim:');
      expect(snapshot(sim.ledger), name).toEqual(baseline);
    }
  });

  it('never leaves a receipt without its nullifier', () => {
    const sim = setup();
    for (let i = 0; i < 6; i++) {
      const claim = signedClaim(credential({ claimNonce: bytes32(`mixed-${i}`), billedAmount: i % 2 ? 900_000n : 100_000n }));
      try {
        submit(sim, claim);
      } catch {
        // Over-cap claims are expected to fail.
      }
    }
    const l = sim.ledger;
    // Ledger maps iterate in hash order, not insertion order.
    const receipts = [...l.claimReceipts].sort(([a], [b]) => (a < b ? -1 : 1));
    expect(receipts).toHaveLength(3);
    expect(l.consumedClaimNullifiers.size()).toBe(3n);
    expect(l.acceptedClaimCount).toBe(3n);
    receipts.forEach(([index, receipt], position) => {
      expect(index).toBe(BigInt(position));
      expect(l.consumedClaimNullifiers.member(receipt.claimNullifier)).toBe(true);
    });
  });

  it('a rejected claim does not consume a receipt number', () => {
    const sim = setup();
    submit(sim, signedClaim());
    expect(() => submit(sim, signedClaim(credential({ billedAmount: 9_999_999n, claimNonce: bytes32('big') })))).toThrow();
    const l = submit(sim, signedClaim(credential({ claimNonce: bytes32('claim-0002') })));
    expect([...l.claimReceipts].map(([index]) => index).sort()).toEqual([0n, 1n]);
    expect(l.consumedClaimNullifiers.size()).toBe(2n);
    expect(hex(l.claimReceipts.lookup(1n).claimNullifier)).not.toBe(hex(l.claimReceipts.lookup(0n).claimNullifier));
  });
});

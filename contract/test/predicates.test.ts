import { describe, expect, it } from 'vitest';
import { TERMS, credential, expectRejected, setup, signedClaim, submit } from './fixtures.js';
import type { ClaimCredential } from '../src/managed/veilclaim/contract/index.js';

const accepts = (overrides: Partial<ClaimCredential>) => {
  const sim = setup();
  expect(submit(sim, signedClaim(credential(overrides))).acceptedClaimCount).toBe(1n);
};

const rejects = (overrides: Partial<ClaimCredential>, message: string) => {
  const sim = setup();
  expectRejected(sim, () => submit(sim, signedClaim(credential(overrides))), message);
};

describe('policy predicates on private claim values', () => {
  describe('category', () => {
    it('accepts the covered category', () => accepts({ categoryCode: TERMS.category }));
    it('rejects any other category', () => rejects({ categoryCode: 5n }, 'VeilClaim: category not covered'));
  });

  describe('amount', () => {
    it('accepts an amount below the cap', () => accepts({ billedAmount: 1n }));
    it('accepts an amount exactly at the cap', () => accepts({ billedAmount: TERMS.cap }));
    it('rejects one unit above the cap', () => rejects({ billedAmount: TERMS.cap + 1n }, 'VeilClaim: amount exceeds policy cap'));
  });

  describe('service date', () => {
    it('accepts the first epoch of the window', () => accepts({ serviceEpoch: TERMS.from }));
    it('rejects the epoch before the window', () =>
      rejects({ serviceEpoch: TERMS.from - 1n }, 'VeilClaim: service date outside policy window'));
    it('accepts the last epoch of the window', () => accepts({ serviceEpoch: TERMS.until }));
    it('rejects the epoch after the window', () =>
      rejects({ serviceEpoch: TERMS.until + 1n }, 'VeilClaim: service date outside policy window'));
  });
});

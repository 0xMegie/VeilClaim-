import { describe, expect, it } from 'vitest';
import {
  ADMIN,
  MED_01,
  MED_01_KEYS,
  MED_02,
  MED_02_KEYS,
  credential,
  expectRejected,
  setup,
  signedClaim,
  submit,
} from './fixtures.js';
import { bytes32 } from './simulator.js';

describe('provider registry', () => {
  it('admin approves a provider and its attestation key', () => {
    const l = setup().ledger;
    expect(l.providers.lookup(MED_01)).toEqual({ attestationKey: MED_01_KEYS.attestationKey, approved: true });
  });

  it('rejects provider changes from a caller without the admin secret', () => {
    const sim = setup().as({ adminSecret: bytes32('attacker') });
    expectRejected(sim, () => sim.setProviderStatus(MED_02, MED_02_KEYS.attestationKey, true), 'VeilClaim: not admin');
  });

  it('accepts a claim attested by an approved provider', () => {
    const sim = setup();
    expect(submit(sim, signedClaim()).acceptedClaimCount).toBe(1n);
  });

  it('rejects a claim from a provider that was never registered', () => {
    const sim = setup();
    const claim = signedClaim(credential({ providerId: MED_02 }), MED_02_KEYS);
    expectRejected(sim, () => submit(sim, claim), 'VeilClaim: unknown provider');
  });

  it('rejects a claim from a revoked provider', () => {
    const sim = setup();
    sim.as({ adminSecret: ADMIN }).setProviderStatus(MED_01, MED_01_KEYS.attestationKey, false);
    expectRejected(sim, () => submit(sim, signedClaim()), 'VeilClaim: provider not approved');
  });

  it('rejects a claim naming an approved provider but signed with another key', () => {
    const sim = setup();
    const forged = signedClaim(credential({ providerId: MED_01 }), MED_02_KEYS);
    expectRejected(sim, () => submit(sim, forged), 'VeilClaim: invalid provider attestation');
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { pureCircuits } from '../src/managed/veilclaim/contract/index.js';
import { ADMIN, MED_01, MED_01_KEYS, POLICY, credential, signedClaim, submit } from './fixtures.js';
import { VeilClaimSimulator, hex, hexDump, snapshot } from './simulator.js';

// Checks the real disclosure boundary: the public transcript and circuit input/output are what the transaction
// publishes; privateTranscriptOutputs are the witness values that stay inside the proof. Every needle must be found
// on the private side (so the search is known to work) and never on the public side or in the ledger.

/** Aligned values store integers little-endian with trailing zero bytes trimmed. */
const uintNeedle = (value: bigint): string => {
  let out = '';
  for (let v = value; v > 0n; v >>= 8n) out += (v & 0xffn).toString(16).padStart(2, '0');
  return out;
};

/** Byte strings are stored with trailing zero bytes trimmed. */
const bytesNeedle = (bytes: Uint8Array): string => hex(bytes).replace(/(00)+$/, '');

// Distinctive values, and a wide 2026 policy window, so needles cannot collide with public policy terms.
const AMOUNT = 283_147n;
const SERVICE_EPOCH = 20_686n;

describe('privacy of an accepted claim', () => {
  let publicSide: string;
  let privateSide: string;
  let ledgerDump: string;
  let nullifier: string;
  const claim = signedClaim(credential({ billedAmount: AMOUNT, serviceEpoch: SERVICE_EPOCH }));

  beforeAll(() => {
    const sim = new VeilClaimSimulator(ADMIN).as({ adminSecret: ADMIN });
    sim.createPolicy(POLICY, 20_454n, 20_818n, 4n, 500_000n);
    sim.setProviderStatus(MED_01, MED_01_KEYS.attestationKey, true);
    const l = submit(sim, claim);
    nullifier = bytesNeedle(l.claimReceipts.lookup(0n).claimNullifier);
    const proof = sim.lastProofData!;
    publicSide = hexDump([proof.input, proof.output, proof.publicTranscript]);
    privateSide = hexDump(proof.privateTranscriptOutputs);
    ledgerDump = hexDump(snapshot(sim.ledger));
  });

  const expectPrivateOnly = (needle: string) => {
    expect(needle.length).toBeGreaterThanOrEqual(4);
    expect(privateSide).toContain(needle);
    expect(publicSide).not.toContain(needle);
    expect(ledgerDump).not.toContain(needle);
  };

  it('never publishes the billed amount', () => expectPrivateOnly(uintNeedle(AMOUNT)));

  it('never publishes the service date', () => expectPrivateOnly(uintNeedle(SERVICE_EPOCH)));

  it('never publishes the holder secret or the holder commitment that identifies the claimant', () => {
    expectPrivateOnly(bytesNeedle(claim.holderSecret));
    expectPrivateOnly(bytesNeedle(claim.credential.holderCommitment));
  });

  it('never publishes the raw credential: its nonce or its commitment', () => {
    expectPrivateOnly(bytesNeedle(claim.credential.claimNonce));
    const commitment = bytesNeedle(pureCircuits.deriveCredentialCommitment(claim.credential));
    expect(publicSide).not.toContain(commitment);
    expect(ledgerDump).not.toContain(commitment);
  });

  it('never publishes the provider signature', () => {
    expectPrivateOnly(uintNeedle(claim.attestation.s));
    expectPrivateOnly(uintNeedle(claim.attestation.r.x));
  });

  it('does publish the policy id, the attesting provider id and the claim nullifier', () => {
    expect(publicSide).toContain(bytesNeedle(POLICY));
    expect(publicSide).toContain(bytesNeedle(MED_01));
    expect(publicSide).toContain(nullifier);
    expect(ledgerDump).toContain(nullifier);
  });
});

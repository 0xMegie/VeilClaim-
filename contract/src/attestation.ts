import { ecMulGenerator, type JubjubPoint } from '@midnight-ntwrk/compact-runtime';
import { type ClaimCredential, type ProviderAttestation, pureCircuits } from './managed/veilclaim/contract/index.js';

/** Order of the Jubjub prime-order subgroup. The runtime rejects any scalar at or above it. */
export const JUBJUB_ORDER = 0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;

export interface ProviderKeyPair {
  readonly secretKey: bigint;
  readonly attestationKey: JubjubPoint;
}

const randomScalar = (): bigint => {
  // 512 random bits reduced mod the order: negligible bias.
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return (value % (JUBJUB_ORDER - 1n)) + 1n;
};

export const providerKeyPairFromSecret = (secretKey: bigint): ProviderKeyPair => {
  if (secretKey <= 0n || secretKey >= JUBJUB_ORDER) throw new Error('Provider secret key must be in [1, order).');
  return { secretKey, attestationKey: ecMulGenerator(secretKey) };
};

export const generateProviderKeyPair = (): ProviderKeyPair => providerKeyPairFromSecret(randomScalar());

/**
 * Schnorr-sign a claim credential so the contract's `attestationValid` accepts it:
 * s = nonce + e·sk mod order, with e taken from the contract's own `attestationChallenge`.
 */
export const signCredential = (
  provider: ProviderKeyPair,
  credential: ClaimCredential,
  nonce: bigint = randomScalar(),
): ProviderAttestation => {
  const r = ecMulGenerator(nonce);
  const commitment = pureCircuits.deriveCredentialCommitment(credential);
  const e = pureCircuits.attestationChallenge(r, provider.attestationKey, commitment);
  return { r, s: (nonce + e * provider.secretKey) % JUBJUB_ORDER };
};

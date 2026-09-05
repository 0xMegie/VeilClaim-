import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { ClaimCredential, Ledger, ProviderAttestation } from './managed/veilclaim/contract/index.js';

/**
 * Everything here stays on the claimant's device and only reaches the chain as ZK witness input.
 * A role that does not need a value leaves it null; the witness throws if a circuit asks for it.
 */
export type VeilClaimPrivateState = {
  readonly adminSecret: Uint8Array | null;
  readonly holderSecret: Uint8Array | null;
  readonly credential: ClaimCredential | null;
  readonly attestation: ProviderAttestation | null;
};

export const emptyPrivateState = (): VeilClaimPrivateState => ({
  adminSecret: null,
  holderSecret: null,
  credential: null,
  attestation: null,
});

type Ctx = WitnessContext<Ledger, VeilClaimPrivateState>;

const required = <T>(value: T | null, name: string): T => {
  if (value === null) throw new Error(`VeilClaim witness unavailable: ${name}`);
  return value;
};

export const witnesses = {
  adminSecret: ({ privateState }: Ctx): [VeilClaimPrivateState, Uint8Array] => [
    privateState,
    required(privateState.adminSecret, 'adminSecret'),
  ],
  holderSecret: ({ privateState }: Ctx): [VeilClaimPrivateState, Uint8Array] => [
    privateState,
    required(privateState.holderSecret, 'holderSecret'),
  ],
  claimCredential: ({ privateState }: Ctx): [VeilClaimPrivateState, ClaimCredential] => [
    privateState,
    required(privateState.credential, 'claimCredential'),
  ],
  providerAttestation: ({ privateState }: Ctx): [VeilClaimPrivateState, ProviderAttestation] => [
    privateState,
    required(privateState.attestation, 'providerAttestation'),
  ],
};

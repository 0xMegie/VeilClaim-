import type { ProvableCircuitId } from '@midnight-ntwrk/compact-js';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { VeilClaim, VeilClaimPrivateState } from '@veilclaim/contract';

export const veilClaimPrivateStateId = 'veilClaimPrivateState';
export type VeilClaimPrivateStateId = typeof veilClaimPrivateStateId;

export type VeilClaimContract = VeilClaim.Contract<VeilClaimPrivateState>;
export type VeilClaimCircuitId = ProvableCircuitId<VeilClaimContract>;
export type VeilClaimProviders = MidnightProviders<VeilClaimCircuitId, VeilClaimPrivateStateId, VeilClaimPrivateState>;
export type DeployedVeilClaimContract = DeployedContract<VeilClaimContract> | FoundContract<VeilClaimContract>;

/** Public ledger view. By construction this carries no claim amount, date, category, or holder data. */
export interface VeilClaimPublicState {
  readonly policies: ReadonlyArray<{ readonly policyId: string } & VeilClaim.Policy>;
  readonly providers: ReadonlyArray<{ readonly providerId: string } & VeilClaim.Provider>;
  readonly consumedClaimNullifiers: ReadonlyArray<string>;
  readonly claimReceipts: ReadonlyArray<{ readonly index: bigint; readonly policyId: string; readonly claimNullifier: string }>;
  readonly acceptedClaimCount: bigint;
}

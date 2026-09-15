import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Policy = { active: boolean;
                       validFromEpoch: bigint;
                       validUntilEpoch: bigint;
                       coveredCategory: bigint;
                       maxAmount: bigint
                     };

export type Provider = { attestationKey: __compactRuntime.JubjubPoint;
                         approved: boolean
                       };

export type ClaimReceipt = { policyId: Uint8Array; claimNullifier: Uint8Array };

export type ClaimCredential = { holderCommitment: Uint8Array;
                                providerId: Uint8Array;
                                policyId: Uint8Array;
                                categoryCode: bigint;
                                serviceEpoch: bigint;
                                billedAmount: bigint;
                                claimNonce: Uint8Array
                              };

export type ProviderAttestation = { r: __compactRuntime.JubjubPoint; s: bigint
                                  };

export type Witnesses<PS> = {
  adminSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  holderSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  claimCredential(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, ClaimCredential];
  providerAttestation(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, ProviderAttestation];
}

export type ImpureCircuits<PS> = {
  createPolicy(context: __compactRuntime.CircuitContext<PS>,
               policyId_0: Uint8Array,
               validFromEpoch_0: bigint,
               validUntilEpoch_0: bigint,
               coveredCategory_0: bigint,
               maxAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  deactivatePolicy(context: __compactRuntime.CircuitContext<PS>,
                   policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setProviderStatus(context: __compactRuntime.CircuitContext<PS>,
                    providerId_0: Uint8Array,
                    attestationKey_0: __compactRuntime.JubjubPoint,
                    approved_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  submitClaim(context: __compactRuntime.CircuitContext<PS>,
              policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  createPolicy(context: __compactRuntime.CircuitContext<PS>,
               policyId_0: Uint8Array,
               validFromEpoch_0: bigint,
               validUntilEpoch_0: bigint,
               coveredCategory_0: bigint,
               maxAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  deactivatePolicy(context: __compactRuntime.CircuitContext<PS>,
                   policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setProviderStatus(context: __compactRuntime.CircuitContext<PS>,
                    providerId_0: Uint8Array,
                    attestationKey_0: __compactRuntime.JubjubPoint,
                    approved_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  submitClaim(context: __compactRuntime.CircuitContext<PS>,
              policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveAdminCommitment(secret_0: Uint8Array): Uint8Array;
  deriveHolderCommitment(secret_0: Uint8Array): Uint8Array;
  deriveCredentialCommitment(credential_0: ClaimCredential): Uint8Array;
  attestationChallenge(r_0: __compactRuntime.JubjubPoint,
                       attestationKey_0: __compactRuntime.JubjubPoint,
                       credentialCommitment_0: Uint8Array): bigint;
}

export type Circuits<PS> = {
  deriveAdminCommitment(context: __compactRuntime.CircuitContext<PS>,
                        secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveHolderCommitment(context: __compactRuntime.CircuitContext<PS>,
                         secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveCredentialCommitment(context: __compactRuntime.CircuitContext<PS>,
                             credential_0: ClaimCredential): __compactRuntime.CircuitResults<PS, Uint8Array>;
  attestationChallenge(context: __compactRuntime.CircuitContext<PS>,
                       r_0: __compactRuntime.JubjubPoint,
                       attestationKey_0: __compactRuntime.JubjubPoint,
                       credentialCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  createPolicy(context: __compactRuntime.CircuitContext<PS>,
               policyId_0: Uint8Array,
               validFromEpoch_0: bigint,
               validUntilEpoch_0: bigint,
               coveredCategory_0: bigint,
               maxAmount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  deactivatePolicy(context: __compactRuntime.CircuitContext<PS>,
                   policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setProviderStatus(context: __compactRuntime.CircuitContext<PS>,
                    providerId_0: Uint8Array,
                    attestationKey_0: __compactRuntime.JubjubPoint,
                    approved_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  submitClaim(context: __compactRuntime.CircuitContext<PS>,
              policyId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly adminCommitment: Uint8Array;
  policies: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Policy;
    [Symbol.iterator](): Iterator<[Uint8Array, Policy]>
  };
  providers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Provider;
    [Symbol.iterator](): Iterator<[Uint8Array, Provider]>
  };
  consumedClaimNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  claimReceipts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): ClaimReceipt;
    [Symbol.iterator](): Iterator<[bigint, ClaimReceipt]>
  };
  readonly acceptedClaimCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               initialAdminCommitment_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;

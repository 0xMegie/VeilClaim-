/**
 * Platform-agnostic VeilClaim API. The browser (Lace) supplies providers; this layer never
 * enforces policy — the Compact contract is the security boundary.
 */
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type ContractAddress, type JubjubPoint, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  CompiledVeilClaimContract,
  type PrivateClaim,
  VeilClaim,
  type VeilClaimPrivateState,
  adminPrivateState,
  claimantPrivateState,
  emptyPrivateState,
} from '@veilclaim/contract';
import { type Observable, map } from 'rxjs';
import {
  type DeployedVeilClaimContract,
  type VeilClaimProviders,
  type VeilClaimPublicState,
  veilClaimPrivateStateId,
} from './common-types.js';

export * from './claim-codec.js';
export * from './common-types.js';
export * from './demo.js';
export * from './encoding.js';
export * from './in-memory-private-state-provider.js';

export const toPublicState = (l: VeilClaim.Ledger): VeilClaimPublicState => ({
  policies: [...l.policies].map(([id, policy]) => ({ policyId: toHex(id), ...policy })),
  providers: [...l.providers].map(([id, provider]) => ({ providerId: toHex(id), ...provider })),
  consumedClaimNullifiers: [...l.consumedClaimNullifiers].map(toHex),
  claimReceipts: [...l.claimReceipts].map(([index, r]) => ({
    index,
    policyId: toHex(r.policyId),
    claimNullifier: toHex(r.claimNullifier),
  })),
  acceptedClaimCount: l.acceptedClaimCount,
});

/** Public transaction facts only. Call results also carry private ZK inputs, which must never be logged or stored. */
export interface TxReceipt {
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number;
}

const publicReceipt = (result: { public: { txId: string; txHash: string; blockHeight: number } }): TxReceipt => ({
  txId: result.public.txId,
  txHash: result.public.txHash,
  blockHeight: result.public.blockHeight,
});

export interface PolicyTerms {
  readonly policyId: Uint8Array;
  readonly validFromEpoch: bigint;
  readonly validUntilEpoch: bigint;
  readonly coveredCategory: bigint;
  readonly maxAmount: bigint;
}

export class VeilClaimAPI {
  readonly contractAddress: ContractAddress;
  readonly state$: Observable<VeilClaimPublicState>;

  private constructor(
    readonly deployedContract: DeployedVeilClaimContract,
    private readonly providers: VeilClaimProviders,
  ) {
    this.contractAddress = deployedContract.deployTxData.public.contractAddress;
    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.contractAddress, { type: 'latest' })
      .pipe(map((state) => toPublicState(VeilClaim.ledger(state.data))));
  }

  get deployReceipt(): TxReceipt {
    return publicReceipt(this.deployedContract.deployTxData);
  }

  // Each call loads exactly the private state its witnesses need, so admin and claimant roles never leak into each other.
  private async usePrivateState(state: VeilClaimPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(veilClaimPrivateStateId, state);
  }

  async createPolicy(adminSecret: Uint8Array, terms: PolicyTerms): Promise<TxReceipt> {
    await this.usePrivateState(adminPrivateState(adminSecret));
    const result = await this.deployedContract.callTx.createPolicy(
      terms.policyId,
      terms.validFromEpoch,
      terms.validUntilEpoch,
      terms.coveredCategory,
      terms.maxAmount,
    );
    return publicReceipt(result);
  }

  async deactivatePolicy(adminSecret: Uint8Array, policyId: Uint8Array): Promise<TxReceipt> {
    await this.usePrivateState(adminPrivateState(adminSecret));
    return publicReceipt(await this.deployedContract.callTx.deactivatePolicy(policyId));
  }

  async setProviderStatus(
    adminSecret: Uint8Array,
    providerId: Uint8Array,
    attestationKey: JubjubPoint,
    approved: boolean,
  ): Promise<TxReceipt> {
    await this.usePrivateState(adminPrivateState(adminSecret));
    const result = await this.deployedContract.callTx.setProviderStatus(providerId, attestationKey, approved);
    return publicReceipt(result);
  }

  async submitClaim(claim: PrivateClaim): Promise<TxReceipt> {
    await this.usePrivateState(claimantPrivateState(claim));
    try {
      return publicReceipt(await this.deployedContract.callTx.submitClaim(claim.credential.policyId));
    } finally {
      await this.usePrivateState(emptyPrivateState());
    }
  }

  static async deploy(providers: VeilClaimProviders, adminSecret: Uint8Array): Promise<VeilClaimAPI> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledVeilClaimContract,
      privateStateId: veilClaimPrivateStateId,
      initialPrivateState: emptyPrivateState(),
      args: [VeilClaim.pureCircuits.deriveAdminCommitment(adminSecret)],
    });
    return new VeilClaimAPI(deployed, providers);
  }

  static async join(providers: VeilClaimProviders, contractAddress: ContractAddress): Promise<VeilClaimAPI> {
    const found = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: CompiledVeilClaimContract,
      privateStateId: veilClaimPrivateStateId,
      initialPrivateState: emptyPrivateState(),
    });
    return new VeilClaimAPI(found, providers);
  }
}

/** Human-readable reason for a contract rejection, or null if the error did not come from a VeilClaim assertion. */
export const contractRejection = (err: unknown): string | null => {
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : String(err);
  const match = /VeilClaim: ([a-z ]+)/i.exec(text);
  if (!match) return null;
  const reasons: Record<string, string> = {
    'amount exceeds policy cap': 'Policy denied: the claim amount is above this policy’s cap.',
    'category not covered': 'Policy denied: this service category is not covered.',
    'service date outside policy window': 'Policy denied: the service date is outside the policy period.',
    'claim already consumed': 'Rejected: this claim has already been used. Each claim can be consumed once.',
    'invalid provider attestation': 'Rejected: the provider’s signature does not match this claim.',
    'holder binding failed': 'Rejected: this claim belongs to a different holder.',
    'provider not approved': 'Rejected: the provider is not approved.',
    'unknown provider': 'Rejected: the provider is not registered.',
    'credential is for another policy': 'Rejected: this claim was issued for a different policy.',
    'unknown policy': 'Rejected: the policy does not exist on this contract.',
    'policy inactive': 'Rejected: the policy is no longer active.',
    'not admin': 'Rejected: only the contract admin can do this.',
    'policy exists': 'Already done: this policy exists.',
  };
  return reasons[match[1].trim()] ?? `Rejected by the contract: ${match[1].trim()}.`;
};

/**
 * Platform-agnostic VeilClaim API. The browser (Lace) supplies providers; this layer never
 * enforces policy — the Compact contract is the security boundary.
 */
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type ContractAddress, type JubjubPoint, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { CompiledVeilClaimContract, VeilClaim, type VeilClaimPrivateState } from '@veilclaim/contract';
import { type Observable, map } from 'rxjs';
import {
  type DeployedVeilClaimContract,
  type VeilClaimProviders,
  type VeilClaimPublicState,
  veilClaimPrivateStateId,
} from './common-types.js';

export * from './common-types.js';

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

  /** Replace the local private state that witnesses read from before the next call. */
  async setPrivateState(state: VeilClaimPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(veilClaimPrivateStateId, state);
  }

  async createPolicy(policyId: Uint8Array, from: bigint, until: bigint, category: bigint, maxAmount: bigint) {
    return this.deployedContract.callTx.createPolicy(policyId, from, until, category, maxAmount);
  }

  async setProviderStatus(providerId: Uint8Array, attestationKey: JubjubPoint, approved: boolean) {
    return this.deployedContract.callTx.setProviderStatus(providerId, attestationKey, approved);
  }

  async submitClaim(policyId: Uint8Array) {
    return this.deployedContract.callTx.submitClaim(policyId);
  }

  static async deploy(
    providers: VeilClaimProviders,
    adminSecret: Uint8Array,
    initialPrivateState: VeilClaimPrivateState,
  ): Promise<VeilClaimAPI> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledVeilClaimContract,
      privateStateId: veilClaimPrivateStateId,
      initialPrivateState,
      args: [VeilClaim.pureCircuits.deriveAdminCommitment(adminSecret)],
    });
    return new VeilClaimAPI(deployed, providers);
  }

  static async join(
    providers: VeilClaimProviders,
    contractAddress: ContractAddress,
    initialPrivateState: VeilClaimPrivateState,
  ): Promise<VeilClaimAPI> {
    const found = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: CompiledVeilClaimContract,
      privateStateId: veilClaimPrivateStateId,
      initialPrivateState,
    });
    return new VeilClaimAPI(found, providers);
  }
}

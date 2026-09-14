import {
  type CircuitContext,
  type JubjubPoint,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger, pureCircuits } from '../src/managed/veilclaim/contract/index.js';
import { type VeilClaimPrivateState, emptyPrivateState, witnesses } from '../src/witnesses.js';

/**
 * Runs the real compiled VeilClaim circuits in-process (no proof server).
 * Every test exercises the generated contract code, never a TypeScript re-implementation.
 * A circuit that fails an assertion throws before its context is kept, like a rejected transaction.
 */
export class VeilClaimSimulator {
  readonly contract = new Contract<VeilClaimPrivateState>(witnesses);
  context: CircuitContext<VeilClaimPrivateState>;

  constructor(readonly adminSecret: Uint8Array) {
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(emptyPrivateState(), '0'.repeat(64)),
      pureCircuits.deriveAdminCommitment(adminSecret),
    );
    this.context = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  get ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  /** Swap the caller's private state, e.g. to act as admin, an attacker, or a claimant. */
  as(privateState: Partial<VeilClaimPrivateState>): this {
    this.context = { ...this.context, currentPrivateState: { ...emptyPrivateState(), ...privateState } };
    return this;
  }

  createPolicy(policyId: Uint8Array, from: bigint, until: bigint, category: bigint, maxAmount: bigint): Ledger {
    this.context = this.contract.impureCircuits.createPolicy(this.context, policyId, from, until, category, maxAmount).context;
    return this.ledger;
  }

  setProviderStatus(providerId: Uint8Array, attestationKey: JubjubPoint, approved: boolean): Ledger {
    this.context = this.contract.impureCircuits.setProviderStatus(this.context, providerId, attestationKey, approved).context;
    return this.ledger;
  }

  submitClaim(policyId: Uint8Array): Ledger {
    this.context = this.contract.impureCircuits.submitClaim(this.context, policyId).context;
    return this.ledger;
  }
}

export const bytes32 = (label: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(label).slice(0, 32));
  return out;
};

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/** A plain, comparable copy of the entire public ledger. */
export const snapshot = (l: Ledger) => ({
  adminCommitment: hex(l.adminCommitment),
  policies: [...l.policies].map(([id, p]) => [hex(id), p]),
  providers: [...l.providers].map(([id, p]) => [hex(id), p]),
  consumedClaimNullifiers: [...l.consumedClaimNullifiers].map(hex).sort(),
  claimReceipts: [...l.claimReceipts].map(([i, r]) => [i, hex(r.policyId), hex(r.claimNullifier)]),
  acceptedClaimCount: l.acceptedClaimCount,
});

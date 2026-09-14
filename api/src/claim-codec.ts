import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { PrivateClaim } from '@veilclaim/contract';

/** JSON-safe form of a claimant's private claim: bytes as hex, integers as decimal strings. */
export interface SerializedClaim {
  readonly holderSecret: string;
  readonly credential: {
    readonly holderCommitment: string;
    readonly providerId: string;
    readonly policyId: string;
    readonly categoryCode: string;
    readonly serviceEpoch: string;
    readonly billedAmount: string;
    readonly claimNonce: string;
  };
  readonly attestation: {
    readonly r: { readonly x: string; readonly y: string };
    readonly s: string;
  };
}

export const encodeClaim = (claim: PrivateClaim): SerializedClaim => ({
  holderSecret: toHex(claim.holderSecret),
  credential: {
    holderCommitment: toHex(claim.credential.holderCommitment),
    providerId: toHex(claim.credential.providerId),
    policyId: toHex(claim.credential.policyId),
    categoryCode: claim.credential.categoryCode.toString(),
    serviceEpoch: claim.credential.serviceEpoch.toString(),
    billedAmount: claim.credential.billedAmount.toString(),
    claimNonce: toHex(claim.credential.claimNonce),
  },
  attestation: {
    r: { x: claim.attestation.r.x.toString(), y: claim.attestation.r.y.toString() },
    s: claim.attestation.s.toString(),
  },
});

export const decodeClaim = (json: SerializedClaim): PrivateClaim => ({
  holderSecret: fromHex(json.holderSecret),
  credential: {
    holderCommitment: fromHex(json.credential.holderCommitment),
    providerId: fromHex(json.credential.providerId),
    policyId: fromHex(json.credential.policyId),
    categoryCode: BigInt(json.credential.categoryCode),
    serviceEpoch: BigInt(json.credential.serviceEpoch),
    billedAmount: BigInt(json.credential.billedAmount),
    claimNonce: fromHex(json.credential.claimNonce),
  },
  attestation: {
    r: { x: BigInt(json.attestation.r.x), y: BigInt(json.attestation.r.y) },
    s: BigInt(json.attestation.s),
  },
});

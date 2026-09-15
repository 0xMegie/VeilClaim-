import type { JubjubPoint } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { decodeClaim } from '@veilclaim/api';
import type { PrivateClaim } from '@veilclaim/contract';
import demo from './claims.json';

// Signed by the controlled demo provider with `bun run demo:issue`. The app can present these claims but not forge them.

export const DEMO_PROVIDER_KEY: JubjubPoint = {
  x: BigInt(demo.provider.attestationKey.x),
  y: BigInt(demo.provider.attestationKey.y),
};

export interface DemoClaim {
  readonly id: string;
  readonly label: string;
  readonly claim: PrivateClaim;
}

export const DEMO_CLAIMS: readonly DemoClaim[] = demo.claims.map((c) => ({
  id: c.id,
  label: c.label,
  claim: decodeClaim(c.claim),
}));

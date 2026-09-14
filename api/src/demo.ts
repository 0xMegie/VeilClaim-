import { bytes32FromLabel, epochDay } from './encoding.js';

/** The single Wave 1 demo policy. */
export const HEALTH_COVER_A = {
  name: 'Health Cover A',
  policyId: bytes32FromLabel('health-cover-a'),
  validFromEpoch: epochDay('2026-01-01'),
  validUntilEpoch: epochDay('2026-12-31'),
  coveredCategory: 4n,
  maxAmount: 500_000n,
} as const;

/** The controlled demo provider. Its public key and signed sample claims live in ui/src/demo/claims.json. */
export const MED_01 = {
  name: 'Med-01',
  providerId: bytes32FromLabel('med-01'),
} as const;

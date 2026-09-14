import { bytes32FromLabel, epochDay } from './encoding.js';

/** The single Wave 1 demo policy (doc.md §16). */
export const HEALTH_COVER_A = {
  name: 'Health Cover A',
  policyId: bytes32FromLabel('health-cover-a'),
  validFromEpoch: epochDay('2026-01-01'),
  validUntilEpoch: epochDay('2026-12-31'),
  coveredCategory: 4n,
  maxAmount: 500_000n,
} as const;

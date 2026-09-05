import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as VeilClaim from './managed/veilclaim/contract/index.js';
import { witnesses } from './witnesses.js';

export { VeilClaim };
export * from './witnesses.js';

export const CompiledVeilClaimContract = CompiledContract.make('veilclaim', VeilClaim.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('./managed/veilclaim'),
);

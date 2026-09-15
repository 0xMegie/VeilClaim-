import { toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { HEALTH_COVER_A, MED_01, type TxReceipt, contractRejection } from '@veilclaim/api';
import { useEffect, useState } from 'react';
import { DEMO_CLAIMS } from '../demo/demo';
import { epochToDate, formatAmount } from '../format';
import { isContractAddress } from '../midnight/config';
import { onTxStage } from '../midnight/providers';
import { errorText, useVeilClaim } from '../midnight/VeilClaimContext';

type Stage = 'connecting' | 'checking' | 'proving' | 'balancing' | 'submitting';

const STAGES: ReadonlyArray<[Stage, string]> = [
  ['connecting', 'Connecting wallet and contract'],
  ['checking', 'Running the claim circuit locally'],
  ['proving', 'Generating zero-knowledge proof'],
  ['balancing', 'Paying fees in Lace'],
  ['submitting', 'Submitting to Midnight'],
];

type Outcome =
  | { kind: 'accepted'; receipt: TxReceipt; proofSeconds: number | null }
  | { kind: 'rejected'; message: string }
  | { kind: 'error'; message: string };

export function ClaimView() {
  const { contractAddress, publicState, getApi } = useVeilClaim();
  const [selectedId, setSelectedId] = useState(DEMO_CLAIMS[0].id);
  const [stage, setStage] = useState<Stage | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const selected = DEMO_CLAIMS.find((c) => c.id === selectedId)!;
  const { credential } = selected.claim;

  useEffect(() => onTxStage((s) => setStage(s)), []);

  const policy = publicState?.policies.find((p) => p.policyId === toHex(HEALTH_COVER_A.policyId));
  const provider = publicState?.providers.find((p) => p.providerId === toHex(credential.providerId));

  // Display only. The same rules are enforced inside the proof; skipping these checks changes nothing on-chain.
  const checks: ReadonlyArray<[string, boolean | null]> = [
    ['Provider', provider ? provider.approved : publicState ? false : null],
    ['Category', policy ? credential.categoryCode === policy.coveredCategory : null],
    ['Date window', policy ? credential.serviceEpoch >= policy.validFromEpoch && credential.serviceEpoch <= policy.validUntilEpoch : null],
    ['Amount policy', policy ? credential.billedAmount <= policy.maxAmount : null],
  ];

  const running = stage !== null;

  async function submit() {
    setOutcome(null);
    setStage('connecting');
    let provingStarted = 0;
    let proofSeconds: number | null = null;
    const stopTiming = onTxStage((s) => {
      if (s === 'proving') provingStarted = performance.now();
      if (s === 'balancing' && provingStarted) proofSeconds = (performance.now() - provingStarted) / 1000;
    });
    try {
      const api = await getApi();
      setStage('checking');
      const receipt = await api.submitClaim(selected.claim);
      setOutcome({ kind: 'accepted', receipt, proofSeconds });
    } catch (err) {
      const rejection = contractRejection(err);
      setOutcome(rejection ? { kind: 'rejected', message: rejection } : { kind: 'error', message: errorText(err) });
    } finally {
      stopTiming();
      setStage(null);
    }
  }

  const choose = (id: string) => {
    setSelectedId(id);
    setOutcome(null);
  };

  return (
    <section className="card claim">
      <fieldset className="claim-picker" disabled={running}>
        <legend>Sample claim from {MED_01.name}</legend>
        {DEMO_CLAIMS.map((c) => (
          <label key={c.id}>
            <input type="radio" name="claim" value={c.id} checked={c.id === selectedId} onChange={() => choose(c.id)} />
            {c.label}
          </label>
        ))}
      </fieldset>

      <div className="private">
        <div className="private-head">
          <h2>Private claim loaded</h2>
          <span className="badge">Stays in this browser</span>
        </div>
        <dl className="facts">
          <dt>Provider</dt>
          <dd>{MED_01.name}</dd>
          <dt>Category</dt>
          <dd>{credential.categoryCode.toString()}</dd>
          <dt>Service date</dt>
          <dd>{epochToDate(credential.serviceEpoch)}</dd>
          <dt>Amount</dt>
          <dd>{formatAmount(credential.billedAmount)}</dd>
        </dl>
      </div>

      <ul className="checks" aria-label="Policy pre-checks">
        {checks.map(([name, ok]) => (
          <li key={name} data-ok={ok === null ? 'unknown' : String(ok)}>
            <span>{name}</span>
            <span aria-label={ok === null ? 'unknown' : ok ? 'passes' : 'fails'}>{ok === null ? '…' : ok ? '✓' : '✗'}</span>
          </li>
        ))}
      </ul>
      <p className="hint">Checked here for display only. The contract enforces these rules inside the proof.</p>

      <div className="actions">
        <button className="primary" onClick={submit} disabled={running || !isContractAddress(contractAddress)}>
          {outcome?.kind === 'accepted' ? 'Submit the same claim again' : 'Generate Private Proof'}
        </button>
      </div>

      {running && (
        <ol className="stages" aria-live="polite">
          {STAGES.map(([key, label]) => {
            const current = STAGES.findIndex(([k]) => k === stage);
            const index = STAGES.findIndex(([k]) => k === key);
            const state = index < current ? 'done' : index === current ? 'active' : 'pending';
            return (
              <li key={key} data-state={state}>
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {outcome?.kind === 'accepted' && (
        <div className="result result-ok" role="status">
          <p>✓ Claim authorized privately</p>
          <p>✓ One-time claim right consumed</p>
          <dl className="facts">
            <dt>Transaction</dt>
            <dd className="mono">{outcome.receipt.txId}</dd>
            <dt>Block</dt>
            <dd>{outcome.receipt.blockHeight}</dd>
            {outcome.proofSeconds !== null && (
              <>
                <dt>Proof generated in</dt>
                <dd>{outcome.proofSeconds.toFixed(1)} s</dd>
              </>
            )}
          </dl>
        </div>
      )}
      {outcome?.kind === 'rejected' && (
        <div className="result result-denied" role="alert">
          <p>{outcome.message}</p>
          <p className="hint">Nothing was written to the ledger.</p>
        </div>
      )}
      {outcome?.kind === 'error' && (
        <div className="result result-error" role="alert">
          <p>The claim could not be submitted.</p>
          <p className="hint">{outcome.message}</p>
        </div>
      )}
    </section>
  );
}

import { toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { HEALTH_COVER_A, MED_01 } from '@veilclaim/api';
import { epochToDate, formatAmount, shortHex } from '../format';
import { NETWORK_ID, isContractAddress } from '../midnight/config';
import { useVeilClaim } from '../midnight/VeilClaimContext';

export function PolicyView() {
  const { contractAddress, publicState, publicStateError } = useVeilClaim();

  if (!isContractAddress(contractAddress)) {
    return (
      <section className="card">
        <h2>No contract configured</h2>
        <p className="hint">Deploy one from the Dev tab, or set VITE_CONTRACT_ADDRESS in ui/.env.</p>
      </section>
    );
  }

  if (!publicState) {
    return (
      <section className="card">
        <h2>Reading the public ledger…</h2>
        <p className="hint">{publicStateError ?? `Contract ${shortHex(contractAddress)} on ${NETWORK_ID}.`}</p>
      </section>
    );
  }

  const policy = publicState.policies.find((p) => p.policyId === toHex(HEALTH_COVER_A.policyId));
  const provider = publicState.providers.find((p) => p.providerId === toHex(MED_01.providerId));
  const providerStatus = !provider ? 'Not registered' : provider.approved ? 'Approved' : 'Revoked';

  return (
    <>
      <section className="card">
        <h2>{HEALTH_COVER_A.name}</h2>
        {policy ? (
          <dl className="facts">
            <dt>Category</dt>
            <dd>{policy.coveredCategory.toString()}</dd>
            <dt>Maximum covered amount</dt>
            <dd>{formatAmount(policy.maxAmount)}</dd>
            <dt>Policy period</dt>
            <dd>
              {epochToDate(policy.validFromEpoch)} – {epochToDate(policy.validUntilEpoch)}
            </dd>
            <dt>Status</dt>
            <dd>{policy.active ? 'Active' : 'Inactive'}</dd>
            <dt>Provider</dt>
            <dd>
              {MED_01.name} · {providerStatus}
            </dd>
            <dt>Accepted claims</dt>
            <dd className="big-number">{publicState.acceptedClaimCount.toString()}</dd>
          </dl>
        ) : (
          <p className="hint">This policy has not been created on the contract yet.</p>
        )}
      </section>

      <section className="card">
        <h2>Public ledger</h2>
        <p className="hint">
          Everything below is readable by anyone on {NETWORK_ID}. Contract {shortHex(contractAddress)}.
        </p>
        {publicState.claimReceipts.length === 0 ? (
          <p>No claims accepted yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Policy</th>
                  <th>Claim nullifier</th>
                </tr>
              </thead>
              <tbody>
                {publicState.claimReceipts.map((r) => (
                  <tr key={r.index.toString()}>
                    <td>#{r.index.toString()}</td>
                    <td>{r.policyId === toHex(HEALTH_COVER_A.policyId) ? HEALTH_COVER_A.name : shortHex(r.policyId)}</td>
                    <td className="mono">{shortHex(r.claimNullifier, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">{publicState.consumedClaimNullifiers.length} consumed claim nullifiers.</p>

        <h3>Never on the ledger</h3>
        <ul className="absent">
          <li>Claim amount</li>
          <li>Service date</li>
          <li>Holder secret or identity</li>
          <li>Claim nonce and raw credential</li>
          <li>Provider signature</li>
        </ul>
      </section>
    </>
  );
}

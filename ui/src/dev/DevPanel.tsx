// Dev-only admin panel: connect Lace, deploy, create the demo policy, approve Med-01, export deployment evidence.
// Removed before submission (roadmap g5).
import { toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { HEALTH_COVER_A, MED_01, type TxReceipt } from '@veilclaim/api';
import { useState } from 'react';
import { DEMO_PROVIDER_KEY } from '../demo/demo';
import { NETWORK_ID, isContractAddress } from '../midnight/config';
import { errorText, useVeilClaim } from '../midnight/VeilClaimContext';
import { type DeploymentRecord, getOrCreateAdminSecret, loadRecord, saveRecord } from './dev-storage';

type LogEntry = { id: number; at: string; text: string; tone: 'info' | 'ok' | 'error' };

export function DevPanel() {
  const { contractAddress, selectContractAddress, publicState, walletStatus, walletError, connectWallet, deploy, getApi } =
    useVeilClaim();
  const [addressInput, setAddressInput] = useState(contractAddress);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [record, setRecord] = useState<DeploymentRecord | null>(loadRecord);
  const [copied, setCopied] = useState(false);

  const append = (text: string, tone: LogEntry['tone'] = 'info') =>
    setLog((entries) => [{ id: Date.now() + Math.random(), at: new Date().toLocaleTimeString('en-GB'), text, tone }, ...entries]);

  const remember = (action: string, address: string, receipt: TxReceipt) => {
    const base = record?.contractAddress === address ? record : { network: NETWORK_ID, contractAddress: address, transactions: [] };
    const next = { ...base, transactions: [...base.transactions, { action, at: new Date().toISOString(), ...receipt }] };
    saveRecord(next);
    setRecord(next);
  };

  async function run(label: string, action: () => Promise<string | void>) {
    setBusy(label);
    append(`${label}…`);
    const started = performance.now();
    try {
      const detail = await action();
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      append(`${label}: done in ${seconds} s${detail ? ` · ${detail}` : ''}`, 'ok');
    } catch (err) {
      append(`${label} failed: ${errorText(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  const describe = (r: TxReceipt) => `tx ${r.txId} · block ${r.blockHeight}`;

  const onDeploy = () =>
    run('Deploy contract', async () => {
      const api = await deploy(getOrCreateAdminSecret());
      setAddressInput(api.contractAddress);
      remember('deploy', api.contractAddress, api.deployReceipt);
      return `${api.contractAddress} · ${describe(api.deployReceipt)}`;
    });

  const onCreatePolicy = () =>
    run(`Create “${HEALTH_COVER_A.name}”`, async () => {
      const api = await getApi();
      const receipt = await api.createPolicy(getOrCreateAdminSecret(), HEALTH_COVER_A);
      remember('createPolicy', api.contractAddress, receipt);
      return describe(receipt);
    });

  const onApproveProvider = () =>
    run(`Approve ${MED_01.name}`, async () => {
      const api = await getApi();
      const receipt = await api.setProviderStatus(getOrCreateAdminSecret(), MED_01.providerId, DEMO_PROVIDER_KEY, true);
      remember('setProviderStatus', api.contractAddress, receipt);
      return describe(receipt);
    });

  const onCopyRecord = async () => {
    if (!record) return;
    await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const policyExists = publicState?.policies.some((p) => p.policyId === toHex(HEALTH_COVER_A.policyId)) ?? false;
  const providerApproved = publicState?.providers.some((p) => p.providerId === toHex(MED_01.providerId) && p.approved) ?? false;
  const hasContract = isContractAddress(contractAddress);

  return (
    <section className="card dev">
      <header>
        <h2>Dev setup</h2>
        <p className="hint">Local only. Transactions go to {NETWORK_ID} through Lace.</p>
      </header>

      <ol className="dev-steps">
        <li>
          <button onClick={() => run('Connect Lace', async () => void (await connectWallet()))} disabled={!!busy || walletStatus === 'connected'}>
            {walletStatus === 'connected' ? 'Lace connected' : 'Connect Lace'}
          </button>
          {walletError && <span className="dev-error">{walletError}</span>}
        </li>
        <li>
          <button onClick={onDeploy} disabled={!!busy || walletStatus !== 'connected'}>
            Deploy new contract
          </button>
          <span className="hint">or use an existing one:</span>
          <div className="dev-join">
            <input
              id="dev-address"
              aria-label="Contract address"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value.trim())}
              placeholder="64 hex characters"
              spellCheck={false}
            />
            <button onClick={() => selectContractAddress(addressInput)} disabled={!isContractAddress(addressInput) || addressInput === contractAddress}>
              Use address
            </button>
          </div>
        </li>
        <li>
          <button onClick={onCreatePolicy} disabled={!!busy || !hasContract || policyExists}>
            {policyExists ? `“${HEALTH_COVER_A.name}” created` : `Create “${HEALTH_COVER_A.name}”`}
          </button>
        </li>
        <li>
          <button onClick={onApproveProvider} disabled={!!busy || !hasContract || providerApproved}>
            {providerApproved ? `${MED_01.name} approved` : `Approve ${MED_01.name}`}
          </button>
        </li>
      </ol>

      {log.length > 0 && (
        <ol className="dev-log" aria-live="polite">
          {log.map((entry) => (
            <li key={entry.id} className={`dev-log-${entry.tone}`}>
              <time>{entry.at}</time> {entry.text}
            </li>
          ))}
        </ol>
      )}

      {record && (
        <div className="dev-record">
          <button type="button" onClick={onCopyRecord}>
            {copied ? 'Copied' : 'Copy deployment record'}
          </button>
          <details>
            <summary>Deployment record ({record.transactions.length} transactions)</summary>
            <pre>{JSON.stringify(record, null, 2)}</pre>
          </details>
        </div>
      )}

      <p className="hint">Admin secret {toHex(getOrCreateAdminSecret()).slice(0, 8)}… is stored in this browser.</p>
    </section>
  );
}

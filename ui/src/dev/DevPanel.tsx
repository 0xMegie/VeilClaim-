// Dev-only admin panel for the Phase 1 toolchain gate: connect Lace, deploy, create the demo policy.
// Removed before submission (roadmap g5).
import { toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { HEALTH_COVER_A, VeilClaimAPI, type VeilClaimProviders, type VeilClaimPublicState } from '@veilclaim/api';
import { emptyPrivateState } from '@veilclaim/contract';
import { useEffect, useState } from 'react';
import { NETWORK_ID, initializeProviders } from '../midnight/providers';
import { getOrCreateAdminSecret, getSavedContractAddress, saveContractAddress } from './dev-storage';

type LogEntry = { at: string; text: string; tone: 'info' | 'ok' | 'error' };

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function DevPanel() {
  const [providers, setProviders] = useState<VeilClaimProviders | null>(null);
  const [api, setApi] = useState<VeilClaimAPI | null>(null);
  const [address, setAddress] = useState(getSavedContractAddress);
  const [ledger, setLedger] = useState<VeilClaimPublicState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!api) return;
    const sub = api.state$.subscribe({
      next: setLedger,
      error: (err) => append(`Ledger subscription failed: ${errorText(err)}`, 'error'),
    });
    return () => sub.unsubscribe();
  }, [api]);

  function append(text: string, tone: LogEntry['tone'] = 'info') {
    const at = new Date().toLocaleTimeString('en-GB');
    setLog((entries) => [{ at, text, tone }, ...entries]);
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    append(`${label}…`);
    const started = performance.now();
    try {
      await action();
      append(`${label} done in ${((performance.now() - started) / 1000).toFixed(1)} s`, 'ok');
    } catch (err) {
      append(`${label} failed: ${errorText(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  const adminPrivateState = () => ({ ...emptyPrivateState(), adminSecret: getOrCreateAdminSecret() });

  const connect = () =>
    run('Connect Lace', async () => {
      setProviders(await initializeProviders());
    });

  const deploy = () =>
    run('Deploy contract', async () => {
      if (!providers) throw new Error('Connect Lace first.');
      const deployed = await VeilClaimAPI.deploy(providers, getOrCreateAdminSecret(), adminPrivateState());
      saveContractAddress(deployed.contractAddress);
      setAddress(deployed.contractAddress);
      setApi(deployed);
      const tx = deployed.deployedContract.deployTxData.public;
      append(`Deployed at ${deployed.contractAddress} · tx ${tx.txId} · block ${tx.blockHeight}`, 'ok');
    });

  const join = () =>
    run('Join contract', async () => {
      if (!providers) throw new Error('Connect Lace first.');
      if (!/^[0-9a-fA-F]{64}$/.test(address)) throw new Error('Contract address must be 64 hex characters.');
      const joined = await VeilClaimAPI.join(providers, address, adminPrivateState());
      saveContractAddress(joined.contractAddress);
      setApi(joined);
    });

  const createPolicy = () =>
    run(`Create “${HEALTH_COVER_A.name}”`, async () => {
      if (!api) throw new Error('Deploy or join a contract first.');
      const p = HEALTH_COVER_A;
      const result = await api.createPolicy(p.policyId, p.validFromEpoch, p.validUntilEpoch, p.coveredCategory, p.maxAmount);
      append(`Policy created · tx ${result.public.txId} · block ${result.public.blockHeight}`, 'ok');
    });

  return (
    <section className="card dev">
      <header>
        <h2>Dev setup</h2>
        <p className="hint">Local only. Deploys to {NETWORK_ID} through Lace.</p>
      </header>

      <div className="dev-actions">
        <button onClick={connect} disabled={!!busy || !!providers}>
          {providers ? 'Lace connected' : 'Connect Lace'}
        </button>
        <button onClick={deploy} disabled={!!busy || !providers}>
          Deploy new contract
        </button>
      </div>

      <div className="dev-join">
        <label htmlFor="dev-address">Contract address</label>
        <input
          id="dev-address"
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          placeholder="64 hex characters"
          spellCheck={false}
        />
        <button onClick={join} disabled={!!busy || !providers || !address}>
          Join
        </button>
      </div>

      <div className="dev-actions">
        <button onClick={createPolicy} disabled={!!busy || !api}>
          Create “{HEALTH_COVER_A.name}” policy
        </button>
      </div>

      {ledger && (
        <dl className="dev-ledger">
          <dt>Policies</dt>
          <dd>{ledger.policies.length ? ledger.policies.map((p) => `${p.policyId.slice(0, 12)}… cap ${p.maxAmount}`).join(', ') : 'none'}</dd>
          <dt>Providers</dt>
          <dd>{ledger.providers.length}</dd>
          <dt>Accepted claims</dt>
          <dd>{ledger.acceptedClaimCount.toString()}</dd>
        </dl>
      )}

      <ol className="dev-log" aria-live="polite" hidden={log.length === 0}>
        {log.map((entry, i) => (
          <li key={log.length - i} className={`dev-log-${entry.tone}`}>
            <time>{entry.at}</time> {entry.text}
          </li>
        ))}
      </ol>
      <p className="hint">Admin secret fingerprint: {toHex(getOrCreateAdminSecret()).slice(0, 8)}… (stored in this browser)</p>
    </section>
  );
}

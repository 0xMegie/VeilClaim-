// Dev-only persistence for the admin setup flow. Removed before submission (roadmap g5).
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { TxReceipt } from '@veilclaim/api';

const ADMIN_SECRET_KEY = 'veilclaim:dev:adminSecret';
const RECORD_KEY = 'veilclaim:dev:deploymentRecord';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the value lives for this page load only.
  }
};

export const getOrCreateAdminSecret = (): Uint8Array => {
  const stored = read(ADMIN_SECRET_KEY);
  if (stored) return fromHex(stored);
  const secret = crypto.getRandomValues(new Uint8Array(32));
  write(ADMIN_SECRET_KEY, toHex(secret));
  return secret;
};

/** Public evidence for deployments/preprod.json. Contains no private inputs. */
export interface DeploymentRecord {
  network: string;
  contractAddress: string;
  transactions: Array<{ action: string; at: string } & TxReceipt>;
}

export const loadRecord = (): DeploymentRecord | null => {
  const stored = read(RECORD_KEY);
  try {
    return stored ? (JSON.parse(stored) as DeploymentRecord) : null;
  } catch {
    return null;
  }
};

export const saveRecord = (record: DeploymentRecord): void => write(RECORD_KEY, JSON.stringify(record, null, 2));

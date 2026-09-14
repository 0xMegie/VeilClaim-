// Dev-only persistence for the admin setup flow. Removed before submission (roadmap g5).
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

const ADMIN_SECRET_KEY = 'veilclaim:dev:adminSecret';
const CONTRACT_ADDRESS_KEY = 'veilclaim:dev:contractAddress';

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

export const getSavedContractAddress = (): string =>
  read(CONTRACT_ADDRESS_KEY) ?? import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export const saveContractAddress = (address: string): void => write(CONTRACT_ADDRESS_KEY, address);

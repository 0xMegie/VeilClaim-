import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export const NETWORK_ID: NetworkId = (import.meta.env.VITE_NETWORK_ID as NetworkId | undefined) ?? 'preprod';

const indexerHost = `indexer.${NETWORK_ID}.midnight.network`;

/** Used to read public ledger state without a wallet. Once Lace connects, its own indexer settings are used. */
export const INDEXER_URL: string = import.meta.env.VITE_INDEXER_URL ?? `https://${indexerHost}/api/v4/graphql`;
export const INDEXER_WS_URL: string = import.meta.env.VITE_INDEXER_WS_URL ?? `wss://${indexerHost}/api/v4/graphql/ws`;

const ADDRESS_KEY = 'veilclaim:contractAddress';
const ENV_ADDRESS: string = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export const isContractAddress = (value: string): boolean => /^[0-9a-fA-F]{64}$/.test(value);

/** In dev, a contract deployed from the Dev tab wins over the env value; production builds always use the env value. */
export const loadContractAddress = (): string => {
  if (!import.meta.env.DEV) return ENV_ADDRESS;
  try {
    return localStorage.getItem(ADDRESS_KEY) ?? ENV_ADDRESS;
  } catch {
    return ENV_ADDRESS;
  }
};

export const storeContractAddress = (address: string): void => {
  try {
    localStorage.setItem(ADDRESS_KEY, address);
  } catch {
    // Storage blocked: the address lasts for this page load.
  }
};

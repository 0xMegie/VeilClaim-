import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';

/** Wave 1 runs on Preprod only. Changing network means redeploying the contract, so this is not configurable. */
export const NETWORK_ID: NetworkId = 'preprod';

const indexerHost = `indexer.${NETWORK_ID}.midnight.network`;

/** Used to read public ledger state without a wallet. Once Lace connects, its own indexer settings are used. */
export const INDEXER_URL = `https://${indexerHost}/api/v4/graphql`;
export const INDEXER_WS_URL = `wss://${indexerHost}/api/v4/graphql/ws`;

const ADDRESS_KEY = 'veilclaim:contractAddress';

// The deployment record committed at deployments/<network>.json is the app's default contract, so a fresh
// clone needs no configuration. The glob keeps the build working when no deployment is recorded yet.
const records = import.meta.glob<{ contractAddress?: string }>('../../../deployments/*.json', {
  eager: true,
  import: 'default',
});
const DEPLOYED_ADDRESS: string =
  Object.entries(records).find(([path]) => path.endsWith(`/${NETWORK_ID}.json`))?.[1]?.contractAddress ?? '';

/** Optional override, for running against a contract you deployed yourself. */
const ENV_ADDRESS: string = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export const isContractAddress = (value: string): boolean => /^[0-9a-fA-F]{64}$/.test(value);

const configuredAddress = (): string => ENV_ADDRESS || DEPLOYED_ADDRESS;

/** In dev, a contract deployed from the Dev tab wins; otherwise the env override, then the recorded deployment. */
export const loadContractAddress = (): string => {
  if (!import.meta.env.DEV) return configuredAddress();
  try {
    return localStorage.getItem(ADDRESS_KEY) ?? configuredAddress();
  } catch {
    return configuredAddress();
  }
};

export const storeContractAddress = (address: string): void => {
  try {
    localStorage.setItem(ADDRESS_KEY, address);
  } catch {
    // Storage blocked: the address lasts for this page load.
  }
};

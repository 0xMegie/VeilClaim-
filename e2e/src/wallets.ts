/**
 * Creates (once) and prints the Preprod test wallets used by the e2e run.
 *
 *   bun run e2e:wallets
 *
 * Seeds live in the gitignored e2e/.wallets.json and are never printed. Only public addresses are shown.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

export const NETWORK_ID = 'preprod';
export const WALLETS_PATH = resolve(import.meta.dirname, '..', '.wallets.json');

export const ROLES = ['admin', 'alice', 'bob'] as const;
export type WalletRole = (typeof ROLES)[number];
export type WalletSeeds = Record<WalletRole, string>;

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

export const loadOrCreateSeeds = (): WalletSeeds => {
  if (existsSync(WALLETS_PATH)) return JSON.parse(readFileSync(WALLETS_PATH, 'utf8')) as WalletSeeds;
  const seeds = Object.fromEntries(ROLES.map((role) => [role, toHex(generateRandomSeed())])) as WalletSeeds;
  writeFileSync(WALLETS_PATH, `${JSON.stringify(seeds, null, 2)}\n`, { mode: 0o600 });
  return seeds;
};

export const deriveKeys = (seedHex: string) => {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Invalid wallet seed');
  const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Key derivation failed');
  hd.hdWallet.clear();
  return derived.keys;
};

export const unshieldedAddress = (seedHex: string): string =>
  createKeystore(deriveKeys(seedHex)[Roles.NightExternal], NETWORK_ID).getBech32Address().toString();

if (import.meta.main) {
  setNetworkId(NETWORK_ID);
  const created = !existsSync(WALLETS_PATH);
  const seeds = loadOrCreateSeeds();
  console.log(created ? `Created ${ROLES.length} wallets in ${WALLETS_PATH} (gitignored).` : `Using wallets in ${WALLETS_PATH}.`);
  console.log('\nFund each unshielded address with tNIGHT at https://faucet.preprod.midnight.network/\n');
  for (const role of ROLES) console.log(`${role.padEnd(6)} ${unshieldedAddress(seeds[role])}`);
}

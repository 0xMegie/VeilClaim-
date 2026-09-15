import { type VeilClaimProviders, type VeilClaimPublicState, VeilClaimAPI } from '@veilclaim/api';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isContractAddress, loadContractAddress, storeContractAddress } from './config';
import { initializeProviders, publicState$ } from './providers';

export type WalletStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface VeilClaimContextValue {
  readonly contractAddress: string;
  readonly selectContractAddress: (address: string) => void;
  readonly publicState: VeilClaimPublicState | null;
  readonly publicStateError: string | null;
  readonly walletStatus: WalletStatus;
  readonly walletError: string | null;
  /** Connects Lace (once) and joins the current contract (once per address). */
  readonly getApi: () => Promise<VeilClaimAPI>;
  readonly connectWallet: () => Promise<VeilClaimProviders>;
  readonly deploy: (adminSecret: Uint8Array) => Promise<VeilClaimAPI>;
}

const Ctx = createContext<VeilClaimContextValue | null>(null);

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function VeilClaimProvider({ children }: { children: ReactNode }) {
  const [contractAddress, setContractAddress] = useState(loadContractAddress);
  const [publicState, setPublicState] = useState<VeilClaimPublicState | null>(null);
  const [publicStateError, setPublicStateError] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle');
  const [walletError, setWalletError] = useState<string | null>(null);

  const providersRef = useRef<Promise<VeilClaimProviders> | null>(null);
  const apisRef = useRef(new Map<string, Promise<VeilClaimAPI>>());

  useEffect(() => {
    setPublicState(null);
    setPublicStateError(null);
    if (!isContractAddress(contractAddress)) return;
    const sub = publicState$(contractAddress).subscribe({
      next: (state) => {
        setPublicState(state);
        setPublicStateError(null);
      },
      error: (err) => setPublicStateError(errorText(err)),
    });
    return () => sub.unsubscribe();
  }, [contractAddress]);

  const connectWallet = useCallback(() => {
    if (!providersRef.current) {
      setWalletStatus('connecting');
      setWalletError(null);
      providersRef.current = initializeProviders().then(
        (providers) => {
          setWalletStatus('connected');
          return providers;
        },
        (err) => {
          providersRef.current = null;
          setWalletStatus('error');
          setWalletError(errorText(err));
          throw err;
        },
      );
    }
    return providersRef.current;
  }, []);

  const getApi = useCallback(async () => {
    if (!isContractAddress(contractAddress)) throw new Error('No contract address is configured.');
    let api = apisRef.current.get(contractAddress);
    if (!api) {
      api = connectWallet().then((providers) => VeilClaimAPI.join(providers, contractAddress));
      apisRef.current.set(contractAddress, api);
      api.catch(() => apisRef.current.delete(contractAddress));
    }
    return api;
  }, [connectWallet, contractAddress]);

  const selectContractAddress = useCallback((address: string) => {
    storeContractAddress(address);
    setContractAddress(address);
  }, []);

  const deploy = useCallback(
    async (adminSecret: Uint8Array) => {
      const providers = await connectWallet();
      const api = await VeilClaimAPI.deploy(providers, adminSecret);
      apisRef.current.set(api.contractAddress, Promise.resolve(api));
      selectContractAddress(api.contractAddress);
      return api;
    },
    [connectWallet, selectContractAddress],
  );

  const value = useMemo<VeilClaimContextValue>(
    () => ({
      contractAddress,
      selectContractAddress,
      publicState,
      publicStateError,
      walletStatus,
      walletError,
      getApi,
      connectWallet,
      deploy,
    }),
    [contractAddress, selectContractAddress, publicState, publicStateError, walletStatus, walletError, getApi, connectWallet, deploy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useVeilClaim = (): VeilClaimContextValue => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useVeilClaim must be used inside VeilClaimProvider');
  return value;
};

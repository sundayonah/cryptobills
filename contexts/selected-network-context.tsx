"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

const SUPPORTED_CHAIN_IDS = [8453, 137, 42161]; // Base, Polygon, Arbitrum
const DEFAULT_CHAIN_ID = 8453;

interface SelectedNetworkContextType {
  chainId: number;
  setChainId: (chainId: number) => void;
}

const SelectedNetworkContext = createContext<SelectedNetworkContextType | undefined>(undefined);

export function SelectedNetworkProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainIdState] = useState<number>(DEFAULT_CHAIN_ID);

  const setChainId = useCallback((id: number) => {
    if (SUPPORTED_CHAIN_IDS.includes(id)) {
      setChainIdState(id);
    }
  }, []);

  return (
    <SelectedNetworkContext.Provider value={{ chainId, setChainId }}>
      {children}
    </SelectedNetworkContext.Provider>
  );
}

export function useSelectedNetwork() {
  const context = useContext(SelectedNetworkContext);
  if (!context) {
    throw new Error("useSelectedNetwork must be used within SelectedNetworkProvider");
  }
  return context;
}

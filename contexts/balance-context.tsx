"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { getTokenAddressForChain } from "@/lib/token-utils";
import { useSelectedNetwork } from "@/contexts/selected-network-context";

export type SupportedToken = "USDC" | "USDT";

interface TokenBalance {
  token: SupportedToken;
  balance: string; // Raw balance in wei/smallest unit
  formatted: string; // Human-readable balance
  decimals: number;
}

interface WalletBalances {
  USDC: TokenBalance | null;
  USDT: TokenBalance | null;
}

interface BalanceContextType {
  // Privy wallet balances
  privyBalances: WalletBalances;
  // Injected wallet balances
  injectedBalances: WalletBalances;
  // Current wallet balances based on payment option
  balances: WalletBalances;
  isLoading: boolean;
  refreshBalances: (chainId?: number) => Promise<void>;
  refreshInjectedBalances: () => Promise<void>;
  getBalance: (token: SupportedToken) => TokenBalance | null;
  clearBalanceCache: (walletType?: 'privy' | 'injected') => void;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

// Supported chain IDs
const SUPPORTED_CHAIN_IDS = [
  8453,   // Base Mainnet only
  // 137,    // Polygon Mainnet (disabled)
  // 42161,  // Arbitrum Mainnet (disabled)
  // 43114,  // Avalanche C-Chain Mainnet (disabled)
];

// RPC URLs for each chain - using Alchemy as primary with fallbacks
const RPC_URLS: Record<number, string[]> = {
  8453: [
    "https://base-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA", // Alchemy Primary
    "https://base.llamarpc.com", // Fallback
    "https://base-rpc.publicnode.com",
  ],
  137: [
    "https://polygon-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA", // Alchemy Primary
    "https://polygon.llamarpc.com", // Fallback
    "https://polygon-rpc.com",
  ],
  42161: [
    "https://arb-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA", // Alchemy Primary
    "https://arbitrum.llamarpc.com", // Fallback
    "https://arb1.arbitrum.io/rpc",
  ],
  43114: [
    "https://avax-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA", // Alchemy Primary
    "https://avalanche.public-rpc.com", // Fallback
    "https://api.avax.network/ext/bc/C/rpc",
  ],
};

// Cache for balance requests
const BALANCE_CACHE_TTL = 30000; // 30 seconds
const balanceCache = new Map<string, { data: TokenBalance | null; timestamp: number }>();

// Helper function to get chain name
const getChainName = (chainId: number): string => {
  const chainNames: Record<number, string> = {
    8453: 'Base',
    137: 'Polygon',
    42161: 'Arbitrum',
    43114: 'Avalanche'
  };
  return chainNames[chainId] || `Chain ${chainId}`;
};

async function fetchTokenBalance(
  provider: ethers.Provider,
  tokenAddress: string,
  walletAddress: string,
  tokenSymbol: SupportedToken,
  chainId: number
): Promise<TokenBalance | null> {
  // Create cache key with chain ID
  const cacheKey = `${walletAddress}-${chainId}-${tokenSymbol}`;

  // Check cache first
  const cached = balanceCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < BALANCE_CACHE_TTL) {
    return cached.data;
  }

  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
    ]);

    const formatted = ethers.formatUnits(balance, decimals);

    const result: TokenBalance = {
      token: tokenSymbol,
      balance: balance.toString(),
      formatted,
      decimals: Number(decimals),
    };

    // Cache the result
    balanceCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error: any) {
    console.warn(`[fetchTokenBalance] Failed to fetch ${tokenSymbol} on chain ${chainId}: ${error?.message}`);

    // Cache null result to avoid repeated failures
    balanceCache.set(cacheKey, {
      data: null,
      timestamp: Date.now(),
    });

    return null;
  }
}

async function getWorkingRpcUrl(chainId: number): Promise<string | null> {
  const urls = RPC_URLS[chainId] || [];

  if (urls.length === 0) {
    console.error(`No RPC URLs configured for chain ${chainId}`);
    return null;
  }

  // Try each URL until one works
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      // Test RPC connectivity
      const provider = new ethers.JsonRpcProvider(url);
      await Promise.race([
        provider.getBlockNumber(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);

      const isAlchemy = url.includes('alchemy.com');
      return url;
    } catch (error: any) {
      console.warn(`[RPC] ❌ Endpoint failed: ${url.includes('alchemy.com') ? 'Alchemy' : 'public'} (${error?.message})`);
      if (i === urls.length - 1) {
        console.error(`[RPC] All endpoints failed for chain ${chainId}, using fallback`);
        return urls[0]; // Return first URL as last resort
      }
    }
  }

  return urls[0];
}

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { chainId: selectedChainId } = useSelectedNetwork();

  const [privyBalances, setPrivyBalances] = useState<WalletBalances>({
    USDC: null,
    USDT: null,
  });

  const [injectedBalances, setInjectedBalances] = useState<WalletBalances>({
    USDC: null,
    USDT: null,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Derive Privy wallet's chain ID from wallets (sync) so we can re-fetch when it changes (e.g. after refresh when Privy hydrates)
  const privyWalletChainId = useMemo(() => {
    const privyWallet = wallets?.find(
      (w) => w.connectorType === "embedded" || w.walletClientType === "privy"
    );
    if (!privyWallet?.chainId) return null;
    const chainIdStr =
      typeof privyWallet.chainId === "string"
        ? privyWallet.chainId
        : String(privyWallet.chainId);
    const chainId = chainIdStr.includes(":")
      ? parseInt(chainIdStr.split(":")[1], 10)
      : parseInt(chainIdStr, 10);
    if (isNaN(chainId) || !SUPPORTED_CHAIN_IDS.includes(chainId)) return null;
    return chainId;
  }, [wallets]);

  // Get Privy wallet chain ID - use Privy wallet's chain so balance follows the app's network dropdown
  const getPrivyChainId = useCallback(async (): Promise<number> => {
    // Prefer the Privy (embedded) wallet's current chain so selecting Arbitrum shows Arbitrum balance
    const privyWallet = wallets?.find(
      (w) => w.connectorType === "embedded" || w.walletClientType === "privy"
    );
    if (privyWallet?.chainId) {
      const chainIdStr =
        typeof privyWallet.chainId === "string"
          ? privyWallet.chainId
          : String(privyWallet.chainId);
      const chainId = chainIdStr.includes(":")
        ? parseInt(chainIdStr.split(":")[1], 10)
        : parseInt(chainIdStr, 10);
      if (!isNaN(chainId) && SUPPORTED_CHAIN_IDS.includes(chainId)) {
        return chainId;
      }
    }
    // Fallback: window.ethereum when no Privy wallet or chain not yet updated
    if (typeof window === "undefined" || !window.ethereum) return 8453;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      return SUPPORTED_CHAIN_IDS.includes(chainId) ? chainId : 8453;
    } catch (error) {
      console.warn(
        "Failed to get current network for Privy, defaulting to Base:",
        error
      );
      return 8453;
    }
  }, [wallets]);

  // Note: Both Privy and injected wallets now follow the current network selection
  // This allows showing network-specific balances for both wallet types

  // Get injected wallet chain ID
  const getInjectedChainId = useCallback(async (): Promise<number> => {
    if (typeof window === 'undefined' || !window.ethereum) return 8453;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      return SUPPORTED_CHAIN_IDS.includes(chainId) ? chainId : 8453;
    } catch (error) {
      console.warn("Failed to get injected wallet chain ID:", error);
      return 8453;
    }
  }, []);

  // Fetch Privy wallet balances (use overrideChainId when switching network so we show the selected chain, not the lagging wallet state)
  const fetchPrivyBalances = useCallback(async (overrideChainId?: number) => {
    if (!ready || !authenticated || !user) {
      setPrivyBalances({ USDC: null, USDT: null });
      return;
    }

    const walletAddress = getWalletAddressFromPrivyUser(user);
    if (!walletAddress) {
      setPrivyBalances({ USDC: null, USDT: null });
      return;
    }

    try {
      // Use the selected network's chain ID from context, or override if provided
      const chainId = overrideChainId ?? selectedChainId;

      const rpcUrl = await getWorkingRpcUrl(chainId);

      if (!rpcUrl) {
        console.error(`No RPC URL available for Privy wallet on chain ${chainId}`);
        return;
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Fetch both token balances
      const tokenPromises = (["USDC", "USDT"] as SupportedToken[]).map(async (tokenSymbol) => {
        const tokenAddress = getTokenAddressForChain(tokenSymbol, chainId);
        if (!tokenAddress) return { token: tokenSymbol, balance: null };

        const balance = await fetchTokenBalance(
          provider,
          tokenAddress,
          walletAddress,
          tokenSymbol,
          chainId
        );

        return { token: tokenSymbol, balance };
      });

      const results = await Promise.all(tokenPromises);

      const newBalances: WalletBalances = { USDC: null, USDT: null };
      results.forEach(({ token, balance }) => {
        newBalances[token] = balance;
      });

      setPrivyBalances(newBalances);

    } catch (error) {
      console.error("Error fetching Privy balances:", error);
      setPrivyBalances({ USDC: null, USDT: null });
    }
  }, [ready, authenticated, user, selectedChainId]);

  // Fetch injected wallet balances
  const fetchInjectedBalances = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setInjectedBalances({ USDC: null, USDT: null });
      return;
    }

    try {
      // Get wallet address from the connected injected wallet
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const walletAddress = await signer.getAddress();

      // Use the selected network's chain ID from context
      const chainId = selectedChainId;

      // Use RPC provider for the selected chain (not the wallet's current chain)
      // This allows us to show balance for the selected network even if wallet is on a different chain
      const rpcUrl = await getWorkingRpcUrl(chainId);

      if (!rpcUrl) {
        console.error(`No RPC URL available for injected wallet on chain ${chainId}`);
        setInjectedBalances({ USDC: null, USDT: null });
        return;
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Fetch both token balances
      const tokenPromises = (["USDC", "USDT"] as SupportedToken[]).map(async (tokenSymbol) => {
        const tokenAddress = getTokenAddressForChain(tokenSymbol, chainId);
        if (!tokenAddress) return { token: tokenSymbol, balance: null };

        const balance = await fetchTokenBalance(
          provider,
          tokenAddress,
          walletAddress,
          tokenSymbol,
          chainId
        );

        return { token: tokenSymbol, balance };
      });

      const results = await Promise.all(tokenPromises);

      const newBalances: WalletBalances = { USDC: null, USDT: null };
      results.forEach(({ token, balance }) => {
        newBalances[token] = balance;
      });

      setInjectedBalances(newBalances);

    } catch (error) {
      console.error("Error fetching injected wallet balances:", error);
      setInjectedBalances({ USDC: null, USDT: null });
    }
  }, [selectedChainId]);

  // Combined refresh function (pass chainId when switching network so balance matches selected chain immediately)
  const refreshBalances = useCallback(async (chainId?: number) => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchPrivyBalances(chainId),
        fetchInjectedBalances()
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPrivyBalances, fetchInjectedBalances]);

  // Refresh only injected balances
  const refreshInjectedBalances = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchInjectedBalances();
    } finally {
      setIsLoading(false);
    }
  }, [fetchInjectedBalances]);

  // Clear balance cache
  const clearBalanceCache = useCallback((walletType?: 'privy' | 'injected') => {
    if (walletType) {
      // Clear all cache for now (can optimize later)
      balanceCache.clear();
    } else {
      balanceCache.clear();
    }
  }, []);

  // Get balance for specific token (defaults to Privy balances)
  const getBalance = useCallback((token: SupportedToken): TokenBalance | null => {
    return privyBalances[token];
  }, [privyBalances]);

  // Current balances (defaults to Privy)
  const balances = privyBalances;

  // Legacy support methods for existing components
  const getBalanceForWallet = useCallback((token: SupportedToken, walletAddress: string): TokenBalance | null => {
    // Check if this is the current Privy wallet address
    const privyAddress = user ? getWalletAddressFromPrivyUser(user) : null;
    if (privyAddress && walletAddress.toLowerCase() === privyAddress.toLowerCase()) {
      return privyBalances[token];
    }

    // Otherwise assume it's an injected wallet
    return injectedBalances[token];
  }, [user, privyBalances, injectedBalances]);

  const refreshBalancesForWallet = useCallback(async (walletAddress: string, targetChainId?: number): Promise<void> => {
    // Check if this is the current Privy wallet address
    const privyAddress = user ? getWalletAddressFromPrivyUser(user) : null;
    if (privyAddress && walletAddress.toLowerCase() === privyAddress.toLowerCase()) {
      await fetchPrivyBalances();
    } else {
      // Otherwise assume it's an injected wallet
      await fetchInjectedBalances();
    }
  }, [user, fetchPrivyBalances, fetchInjectedBalances]);

  // Legacy walletBalances structure for backward compatibility
  const walletBalances = useMemo(() => {
    const result: Record<string, Record<SupportedToken, TokenBalance | null>> = {};

    // Add Privy wallet if available
    const privyAddress = user ? getWalletAddressFromPrivyUser(user) : null;
    if (privyAddress) {
      result[privyAddress.toLowerCase()] = privyBalances;
    }

    // We don't have the injected wallet address easily available here,
    // so we'll just return the Privy wallet for now
    return result;
  }, [user, privyBalances]);

  // Auto-refresh on mount and wallet changes
  useEffect(() => {
    if (ready && authenticated && user) {
      refreshBalances();
    }
  }, [ready, authenticated, user, refreshBalances]);

  // Re-fetch Privy balances when the Privy wallet's chain changes (e.g. after refresh when Privy hydrates with the real chain)
  useEffect(() => {
    if (ready && authenticated && user && privyWalletChainId != null) {
      fetchPrivyBalances();
    }
  }, [privyWalletChainId, ready, authenticated, user, fetchPrivyBalances]);

  // Refresh balances when selected network changes
  useEffect(() => {
    if (ready && authenticated && user && selectedChainId) {
      // Clear balances immediately to show 0.00 while loading
      setPrivyBalances({ USDC: null, USDT: null });
      setInjectedBalances({ USDC: null, USDT: null });
      clearBalanceCache();

      // Fetch balances for the selected network
      fetchPrivyBalances(selectedChainId);
      fetchInjectedBalances();
    }
  }, [selectedChainId, ready, authenticated, user, clearBalanceCache, fetchPrivyBalances, fetchInjectedBalances]);

  // Listen for network changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleChainChanged = (chainId: string) => {
        const newChainId = parseInt(chainId, 16);

        // Immediately clear both wallet balances to show 0.00
        setInjectedBalances({ USDC: null, USDT: null });
        setPrivyBalances({ USDC: null, USDT: null });

        // Clear cache for both wallet types
        clearBalanceCache();

        // Refresh both wallet balances for new network
        setTimeout(async () => {
          try {
            await Promise.all([
              fetchPrivyBalances(),
              fetchInjectedBalances()
            ]);
          } catch (error) {
            console.error(`[NetworkChange] ❌ Balance refresh failed:`, error);
            // Keep balances as null if refresh fails
          }
        }, 300); // Reduced delay for faster refresh
      };

      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum?.removeListener) {
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [clearBalanceCache, fetchInjectedBalances, fetchPrivyBalances]);

  return (
    <BalanceContext.Provider
      value={{
        privyBalances,
        injectedBalances,
        balances,
        isLoading,
        refreshBalances,
        refreshInjectedBalances,
        getBalance,
        clearBalanceCache,
        // Legacy support (temporarily commented out due to TypeScript issues)
        getBalanceForWallet,
        refreshBalancesForWallet,
        walletBalances,
      } as BalanceContextType}
    >
      {children}
    </BalanceContext.Provider>
  );
}

export const useBalance = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error("useBalance must be used within a BalanceProvider");
  }
  return context;
};
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { getTokenAddressForChain } from "@/lib/token-utils";
import type { SupportedToken } from "@/types";

interface TokenBalance {
  token: SupportedToken;
  balance: string; // Raw balance in wei/smallest unit
  formatted: string; // Human-readable balance
  decimals: number;
}

interface BalanceContextType {
  balances: Record<SupportedToken, TokenBalance | null>;
  isLoading: boolean;
  refreshBalances: (targetChainId?: number) => Promise<void>;
  getBalance: (token: SupportedToken) => TokenBalance | null;
  // Multi-wallet support
  getBalanceForWallet: (token: SupportedToken, walletAddress: string) => TokenBalance | null;
  refreshBalancesForWallet: (walletAddress: string, targetChainId?: number) => Promise<void>;
  walletBalances: Record<string, Record<SupportedToken, TokenBalance | null>>;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

async function fetchTokenBalance(
  provider: ethers.Provider,
  tokenAddress: string,
  walletAddress: string,
  tokenSymbol: SupportedToken
): Promise<TokenBalance | null> {
  // Create cache key
  const cacheKey = `${walletAddress}-${tokenAddress}-${tokenSymbol}`;
  
  // Check cache first
  const cached = balanceCache.get(cacheKey);
  if (cached) {
    // Use longer cache for rate limited responses
    const cacheAge = Date.now() - cached.timestamp;
    const ttl = cached.isRateLimited ? RATE_LIMIT_BACKOFF_TTL : BALANCE_CACHE_TTL;
    
    if (cacheAge < ttl) {
      return cached.data;
    }
  }
  
  // Check if request is already in progress
  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey)!;
  }
  
  // Check concurrent request limit - if exceeded, return cached value or null
  if (activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
    console.warn(`Max concurrent requests reached, using cached value for ${tokenSymbol}`);
    const staleCache = balanceCache.get(cacheKey);
    if (staleCache) {
      return staleCache.data;
    }
    return null;
  }
  
  // Create new request
  const requestPromise = (async (): Promise<TokenBalance | null> => {
    activeRequestCount++;
    
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
      );

      // Get balance and decimals with timeout
      const balancePromise = tokenContract.balanceOf(walletAddress);
      const decimalsPromise = tokenContract.decimals();

      // Shorter timeout to fail fast on rate limits
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 5000)
      );

      const [balance, decimals] = await Promise.race([
        Promise.all([balancePromise, decimalsPromise]),
        timeout,
      ]) as [bigint, bigint];

      // Format balance
      const formatted = ethers.formatUnits(balance, decimals);

      const result: TokenBalance = {
        token: tokenSymbol,
        balance: balance.toString(),
        formatted: parseFloat(formatted).toFixed(6), // Show up to 6 decimal places
        decimals: Number(decimals),
      };

      // Cache successful result
      balanceCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error: any) {
      // Handle rate limiting specifically
      const isRateLimit = error?.code === 'NETWORK_ERROR' || 
          error?.reason?.includes('429') ||
          error?.message?.includes('Too Many Requests') ||
          error?.status === 429;
          
      if (isRateLimit) {
        console.warn(`Rate limited for ${tokenSymbol} balance fetch, using cache if available`);
        
        // Return stale cache if available during rate limit
        const staleCache = balanceCache.get(cacheKey);
        if (staleCache) {
          // Mark as rate limited for longer cache TTL
          balanceCache.set(cacheKey, {
            data: staleCache.data,
            timestamp: Date.now(),
            isRateLimited: true,
          });
          return staleCache.data;
        }
        
        // No cache available, cache null with rate limit flag
        balanceCache.set(cacheKey, {
          data: null,
          timestamp: Date.now(),
          isRateLimited: true,
        });
      } else {
        // Other errors - cache null result briefly to avoid rapid retries
        console.warn(`Failed to fetch ${tokenSymbol} balance:`, error?.message || error);
        
        balanceCache.set(cacheKey, {
          data: null,
          timestamp: Date.now(),
        });
      }
      
      return null;
    } finally {
      // Remove from active requests and decrement counter
      activeRequests.delete(cacheKey);
      activeRequestCount--;
    }
  })();
  
  // Store active request
  activeRequests.set(cacheKey, requestPromise);
  
  return requestPromise;
}

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [balances, setBalances] = useState<
    Record<SupportedToken, TokenBalance | null>
  >({
    USDC: null,
    USDT: null,
  });
  const [walletBalances, setWalletBalances] = useState<
    Record<string, Record<SupportedToken, TokenBalance | null>>
  >({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async (targetChainId?: number) => {
    if (!ready || !authenticated || !user) {
      setBalances({ USDC: null, USDT: null });
      return;
    }

    const walletAddress = getWalletAddressFromPrivyUser(user);
    if (!walletAddress) {
      setBalances({ USDC: null, USDT: null });
      return;
    }

    setIsLoading(true);

    try {
      // Prioritize Privy wallet chain ID, especially for embedded wallets
      let provider: ethers.Provider | null = null;
      let chainId: number | null = targetChainId || null; // Use target chainId if provided
      let usePrivyChain = false;

      // Priority 1: If targetChainId is provided, use it (from network switch)
      if (targetChainId) {
        // Using target chainId from network switch
      }
      // Priority 2: Get chain ID from Privy wallet first (especially for embedded wallets)
      else if (wallets && wallets.length > 0) {
        const wallet = wallets[0];
        // For embedded wallets, try to get chainId from provider if wallet.chainId is not available
        if (wallet.chainId) {
          chainId = parseInt(wallet.chainId.split(":")[1] || wallet.chainId);
          // For embedded wallets, prioritize their chain ID
          if (wallet.connectorType === 'embedded' || wallet.walletClientType === 'privy') {
            usePrivyChain = true;
          }
        } else if (wallet.connectorType === 'embedded' || wallet.walletClientType === 'privy') {
          // For embedded wallets, if chainId is not in wallet object, try to get it from provider
          usePrivyChain = true;
        }
      }

      // Priority 3: If targetChainId is provided, skip provider checks and use RPC directly
      // This ensures we fetch balances for the correct network even if wallet state hasn't updated
      if (targetChainId) {
        const rpcUrl = await getWorkingRpcUrl(targetChainId);
        if (rpcUrl) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
          } catch (error) {
            console.error("Failed to create RPC provider for target chain:", error);
          }
        }
      }
      // Priority 4: Try Privy wallet provider first (especially for embedded wallets)
      else if (wallets && wallets.length > 0) {
        const wallet = wallets[0];
        // For embedded wallets, always try to use their provider first
        if (usePrivyChain || wallet.connectorType === 'embedded' || wallet.walletClientType === 'privy') {
          try {
            const ethereumProvider = await wallet.getEthereumProvider();
            if (ethereumProvider) {
              try {
                const privyProvider = new ethers.BrowserProvider(ethereumProvider as any);
                // Get chain ID from provider - this is the source of truth for embedded wallets
                const network = await privyProvider.getNetwork();
                const providerChainId = Number(network.chainId);

                // Always use the chainId from Privy provider for embedded wallets
                // This ensures we get the correct chain even if wallet.chainId wasn't set
                chainId = providerChainId;

                // Try to use the provider, but if it fails, we still have the chainId for RPC fallback
                provider = privyProvider;
              } catch (providerError) {
                // Even if provider creation failed, if we got chainId above, we can use RPC
                // chainId should have been set from wallet.chainId earlier, so we can continue
              }
            }
          } catch (error) {
            // Continue to RPC fallback if we have chainId from wallet.chainId
          }
        }
      }

      // Priority 5: Use window.ethereum only if we don't have a target chainId, no Privy chain, and no embedded wallet
      // Never use window.ethereum if we detected an embedded wallet (to avoid wrong chain detection)
      const isEmbeddedWallet = wallets && wallets.length > 0 &&
        (wallets[0].connectorType === 'embedded' || wallets[0].walletClientType === 'privy');

      if (!provider && !targetChainId && !isEmbeddedWallet && window.ethereum) {
        try {
          const tempProvider = new ethers.BrowserProvider(window.ethereum);
          const network = await tempProvider.getNetwork();
          const windowChainId = Number(network.chainId);

          // If we have a Privy chain ID and it matches window.ethereum, use it
          if (chainId && windowChainId === chainId) {
            provider = tempProvider;
          } else if (!chainId) {
            // No Privy chain ID, use window.ethereum
            provider = tempProvider;
            chainId = windowChainId;
          } else {
            // Chain IDs don't match - prioritize Privy wallet chain
            // Don't use window.ethereum provider, will use RPC instead
          }
        } catch (error) {
          // Continue to RPC fallback
        }
      } else if (isEmbeddedWallet && !chainId && !provider) {
        // If we have an embedded wallet but couldn't get chainId, wait a bit and retry
        // Return early and let the useEffect retry when wallets updates
        setBalances({ USDC: null, USDT: null });
        setIsLoading(false);
        return;
      }

      // Priority 6: If we have chainId but no provider, create one from RPC URL
      if (!provider && chainId) {
        const rpcUrl = await getWorkingRpcUrl(chainId);
        if (rpcUrl) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
          } catch (error) {
            console.error("Failed to create RPC provider:", error);
          }
        }
      }

      if (!provider || !chainId) {
        console.warn("No provider available to fetch balances", { provider: !!provider, chainId });
        setBalances({ USDC: null, USDT: null });
        setIsLoading(false);
        return;
      }

      // Check if chain is supported (mainnets only)
      const supportedChainIds = [
        137,    // Polygon Mainnet
        42161,  // Arbitrum Mainnet
        8453,   // Base Mainnet
        43114,  // Avalanche C-Chain Mainnet
        // 56,     // BSC (Binance Smart Chain) Mainnet - temporarily commented out
      ];
      if (!supportedChainIds.includes(chainId)) {
        // Silently skip unsupported chains
        setBalances({ USDC: null, USDT: null });
        setIsLoading(false);
        return;
      }

      // Get token addresses for current network
      const usdcAddress = getTokenAddressForChain("USDC", chainId);
      const usdtAddress = getTokenAddressForChain("USDT", chainId);

      if (!usdcAddress || !usdtAddress) {
        console.warn(`Token addresses not configured for chain ${chainId}`);
        setBalances({ USDC: null, USDT: null });
        setIsLoading(false);
        return;
      }

      // Fetch both balances in parallel with better error handling
      const balancePromises = [
        fetchTokenBalance(provider, usdcAddress, walletAddress, "USDC").catch((error) => {
          // Only log unexpected errors
          if (!error?.message?.includes("timeout") &&
            error?.code !== "CALL_EXCEPTION" &&
            error?.code !== "UNKNOWN_ERROR") {
            console.warn(`Failed to fetch USDC balance on chain ${chainId}:`, error);
          }
          return null;
        }),
        fetchTokenBalance(provider, usdtAddress, walletAddress, "USDT").catch((error) => {
          // Only log unexpected errors
          if (!error?.message?.includes("timeout") &&
            error?.code !== "CALL_EXCEPTION" &&
            error?.code !== "UNKNOWN_ERROR") {
            console.warn(`Failed to fetch USDT balance on chain ${chainId}:`, error);
          }
          return null;
        }),
      ];

      const [usdcBalance, usdtBalance] = await Promise.all(balancePromises);

      setBalances({
        USDC: usdcBalance,
        USDT: usdtBalance,
      });
    } catch (error) {
      console.error("Error fetching balances:", error);
      setBalances({ USDC: null, USDT: null });
    } finally {
      setIsLoading(false);
    }
  }, [ready, authenticated, user, wallets]);

  // Only refresh on initial mount when ready and authenticated
  // All other refreshes should be manual (network switch or refresh button)
  // Include wallets in dependencies to retry when wallet chainId becomes available
  useEffect(() => {
    if (ready && authenticated && user) {
      // Small delay to ensure wallets array is populated
      const timeoutId = setTimeout(() => {
        fetchBalances();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user?.id, wallets]);

  const getBalance = (token: SupportedToken): TokenBalance | null => {
    return balances[token];
  };

  // Multi-wallet functions
  const getBalanceForWallet = (token: SupportedToken, walletAddress: string): TokenBalance | null => {
    const normalizedAddress = walletAddress.toLowerCase();
    return walletBalances[normalizedAddress]?.[token] || null;
  };

  const fetchBalancesForWallet = async (walletAddress: string, targetChainId?: number) => {
    if (!ready || !authenticated || !user) {
      return;
    }

    const normalizedAddress = walletAddress.toLowerCase();
    setIsLoading(true);

    try {
      // Prioritize target chainId, then Privy wallet chain ID
      let provider: ethers.Provider | null = null;
      let chainId: number | null = targetChainId || null;
      let usePrivyChain = false;

      // Priority 1: If targetChainId is provided, use it
      if (targetChainId) {
        const rpcUrl = await getWorkingRpcUrl(targetChainId);
        if (rpcUrl) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
          } catch (error) {
            console.error("Failed to create RPC provider for target chain:", error);
          }
        }
      }
      // Priority 2: Get chain ID from Privy wallet
      else if (wallets && wallets.length > 0) {
        const wallet = wallets[0];
        if (wallet.chainId) {
          chainId = parseInt(wallet.chainId.split(":")[1] || wallet.chainId);
          usePrivyChain = true;
        }
      }

      // Priority 3: Use RPC fallback if we have chainId but no provider
      if (!provider && chainId) {
        const rpcUrl = await getWorkingRpcUrl(chainId);
        if (rpcUrl) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
          } catch (error) {
            console.error("Failed to create RPC provider:", error);
          }
        }
      }

      // If no provider or chainId, use Base as default (most common)
      if (!provider || !chainId) {
        chainId = 8453; // Base Mainnet
        provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
      }

      const finalChainId = chainId!;
      const finalProvider = provider!;

      // Fetch balances for this specific wallet
      const tokenPromises = (["USDC", "USDT"] as SupportedToken[]).map(async (tokenSymbol) => {
        try {
          const tokenAddress = getTokenAddressForChain(tokenSymbol, finalChainId);
          if (!tokenAddress) return { token: tokenSymbol, balance: null };

          const balance = await fetchTokenBalance(
            finalProvider,
            tokenAddress,
            normalizedAddress,
            tokenSymbol
          );

          return { token: tokenSymbol, balance };
        } catch (error) {
          return { token: tokenSymbol, balance: null };
        }
      });

      const results = await Promise.all(tokenPromises);
      
      // Update wallet balances
      const newWalletBalances = { ...walletBalances };
      if (!newWalletBalances[normalizedAddress]) {
        newWalletBalances[normalizedAddress] = { USDC: null, USDT: null };
      }
      
      results.forEach(({ token, balance }) => {
        newWalletBalances[normalizedAddress][token] = balance;
      });

      setWalletBalances(newWalletBalances);

      // If this is the primary wallet, also update main balances
      const primaryWalletAddress = getWalletAddressFromPrivyUser(user);
      if (primaryWalletAddress && normalizedAddress === primaryWalletAddress.toLowerCase()) {
        const newBalances: Record<SupportedToken, TokenBalance | null> = { USDC: null, USDT: null };
        results.forEach(({ token, balance }) => {
          newBalances[token] = balance;
        });
        setBalances(newBalances);
      }

    } catch (error: any) {
      console.error("Error fetching wallet balances:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BalanceContext.Provider
      value={{
        balances,
        isLoading,
        refreshBalances: fetchBalances,
        getBalance,
        getBalanceForWallet,
        refreshBalancesForWallet: fetchBalancesForWallet,
        walletBalances,
      }}
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

// Rate limiting cache for balance requests
const BALANCE_CACHE_TTL = 30000; // 30 seconds
const RATE_LIMIT_BACKOFF_TTL = 60000; // 1 minute backoff after rate limit
const MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent RPC requests
const balanceCache = new Map<string, { data: TokenBalance | null; timestamp: number; isRateLimited?: boolean }>();
const activeRequests = new Map<string, Promise<TokenBalance | null>>();
let activeRequestCount = 0;

// Helper function to get RPC URLs with fallbacks for a chain
function getRpcUrlsForChain(chainId: number): string[] {
  const rpcUrls: Record<number, string[]> = {
    // Base Mainnet - multiple fallbacks to avoid rate limiting
    8453: [
      "https://base.llamarpc.com",
      "https://base.blockpi.network/v1/rpc/public",
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org", // Official but rate limited
    ],
    137: [
      "https://polygon-rpc.com",
      "https://polygon.llamarpc.com",
      "https://polygon.blockpi.network/v1/rpc/public",
    ],
    42161: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.llamarpc.com",
      "https://arbitrum.blockpi.network/v1/rpc/public",
    ],
    43114: [
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avalanche.public-rpc.com",
    ],
  };
  return rpcUrls[chainId] || [];
}

// Helper function to get first working RPC URL for a chain
async function getWorkingRpcUrl(chainId: number): Promise<string | null> {
  const urls = getRpcUrlsForChain(chainId);
  
  if (urls.length === 0) {
    console.error(`No RPC URLs configured for chain ${chainId}`);
    return null;
  }
  
  // Try each URL with a timeout
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      // Test the RPC endpoint with a simple call and short timeout
      const provider = new ethers.JsonRpcProvider(url);
      
      // Quick health check with 2 second timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), 2000)
      );
      
      await Promise.race([
        provider.getBlockNumber(),
        timeoutPromise
      ]);
      
      // If we get here, the RPC is working
      console.log(`Using RPC endpoint: ${url}`);
      return url;
    } catch (error: any) {
      const isLastUrl = i === urls.length - 1;
      if (isLastUrl) {
        console.error(`All RPC endpoints failed for chain ${chainId}`);
      } else {
        console.warn(`RPC endpoint ${url} failed (${error?.message || error}), trying next...`);
      }
    }
  }
  
  // Return first URL as last resort fallback
  console.warn(`Using fallback RPC endpoint for chain ${chainId}: ${urls[0]}`);
  return urls[0];
}

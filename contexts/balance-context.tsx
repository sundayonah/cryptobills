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
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
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
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );

    // Get balance and decimals with timeout
    const balancePromise = tokenContract.balanceOf(walletAddress);
    const decimalsPromise = tokenContract.decimals();

    // Add timeout to prevent hanging
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), 10000)
    );

    const [balance, decimals] = await Promise.race([
      Promise.all([balancePromise, decimalsPromise]),
      timeout,
    ]) as [bigint, bigint];

    // Format balance
    const formatted = ethers.formatUnits(balance, decimals);

    return {
      token: tokenSymbol,
      balance: balance.toString(),
      formatted: parseFloat(formatted).toFixed(6), // Show up to 6 decimal places
      decimals: Number(decimals),
    };
  } catch (error: any) {
    // Expected errors (timeout, call exceptions, etc.) are silently handled
    // Always return null on error to prevent breaking the UI
    return null;
  }
}

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { client: smartWalletsClient } = useSmartWallets();
  const [balances, setBalances] = useState<
    Record<SupportedToken, TokenBalance | null>
  >({
    USDC: null,
    USDT: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async (targetChainId?: number) => {
    if (!ready || !authenticated || !user) {
      setBalances({ USDC: null, USDT: null });
      return;
    }

    // Prefer smart wallet address over EOA address
    const smartWalletAddress = smartWalletsClient?.account?.address;
    const eoaWalletAddress = getWalletAddressFromPrivyUser(user);
    const walletAddress = smartWalletAddress || eoaWalletAddress;

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
        const rpcUrl = getRpcUrlForChain(targetChainId);
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
        const rpcUrl = getRpcUrlForChain(chainId);
        if (rpcUrl) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
          } catch (error) {
            console.error("Failed to create RPC provider:", error);
          }
        }
      }

      if (!provider || !chainId) {
        console.warn("No provider available to fetch balances");
        setBalances({ USDC: null, USDT: null });
        setIsLoading(false);
        return;
      }

      // Check if chain is supported (mainnets only)
      const supportedChainIds = [
        1,      // Ethereum Mainnet
        137,    // Polygon Mainnet
        42161,  // Arbitrum Mainnet
        8453,   // Base Mainnet
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
  }, [ready, authenticated, user, wallets, smartWalletsClient]);

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
  }, [ready, authenticated, user?.id, wallets, smartWalletsClient]);

  const getBalance = (token: SupportedToken): TokenBalance | null => {
    return balances[token];
  };

  return (
    <BalanceContext.Provider
      value={{
        balances,
        isLoading,
        refreshBalances: fetchBalances,
        getBalance,
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

// Helper function to get RPC URL for a chain
function getRpcUrlForChain(chainId: number): string | null {
  const rpcUrls: Record<number, string> = {
    1: "https://eth-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA", // Ethereum Mainnet (Alchemy)
    137: "https://polygon-rpc.com", // Polygon Mainnet
    42161: "https://arb1.arbitrum.io/rpc", // Arbitrum Mainnet
    8453: "https://mainnet.base.org", // Base Mainnet
    // 56: "https://bsc-dataseed.binance.org", // BSC (Binance Smart Chain) Mainnet - temporarily commented out
  };
  return rpcUrls[chainId] || null;
}

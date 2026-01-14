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
import { TOKEN_CONFIGS } from "@/lib/constants";
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
    // Log all errors for debugging (especially for testnets)
    const isExpectedError =
      error?.message === "Request timeout" ||
      error?.code === "CALL_EXCEPTION" ||
      error?.code === "UNKNOWN_ERROR" ||
      error?.code === -32603 ||
      error?.message?.includes("Invalid RPC URL");

    // Always log errors for debugging, but don't throw

    return null;
  }
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

      // Check if chain is supported (mainnets and testnets)
      const supportedChainIds = [
        1,      // Ethereum Mainnet
        137,    // Polygon Mainnet
        42161,  // Arbitrum Mainnet
        8453,   // Base Mainnet
        84532,  // Base Sepolia Testnet
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
    84532: "https://sepolia.base.org", // Base Sepolia Testnet
  };
  return rpcUrls[chainId] || null;
}

// Helper function to get token address for a specific chain
// Using addresses from the shared NOBLOCKS code
function getTokenAddressForChain(
  token: "USDC" | "USDT",
  chainId: number
): string | null {
  // Token addresses by chain (only supported mainnets)
  const tokenAddresses: Record<
    number,
    { USDC: string; USDT: string }
  > = {
    1: {
      // Ethereum Mainnet
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
    137: {
      // Polygon Mainnet (using updated address from NOBLOCKS)
      USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // Updated Polygon USDC
      USDT: process.env.NEXT_PUBLIC_USDT_ADDRESS || "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    },
    42161: {
      // Arbitrum Mainnet
      USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    },
    8453: {
      // Base Mainnet
      USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
    84532: {
      // Base Sepolia Testnet
      USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      USDT: "0x2C6c7c00ACa9B9D8446d107367485079b0471706",
    },
  };

  return tokenAddresses[chainId]?.[token] || null;
}

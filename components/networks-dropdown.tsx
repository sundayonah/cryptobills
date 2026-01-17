"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_NETWORKS, type Network } from "@/lib/networks";
import { useWallets } from "@privy-io/react-auth";
import { useBalance } from "@/contexts/balance-context";
import { motion } from "framer-motion";
import { getNetworkLogoPath } from "@/lib/network-utils";
import Image from "next/image";

export function NetworksDropdown() {
  const { wallets } = useWallets();
  const { refreshBalances } = useBalance();
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    SUPPORTED_NETWORKS[0] // Default to Polygon
  );

  // Get the current network from the connected wallet
  useEffect(() => {
    if (wallets && wallets.length > 0) {
      const wallet = wallets[0];
      if (wallet.chainId) {
        const network = SUPPORTED_NETWORKS.find(
          (n) => n.chainId === wallet.chainId
        );
        if (network) {
          setSelectedNetwork(network);
        }
      }
    }
  }, [wallets]);

  const handleNetworkChange = async (networkId: string) => {
    const network = SUPPORTED_NETWORKS.find((n) => n.id.toString() === networkId);
    if (!network) return;

    // Optimistically update UI
    setSelectedNetwork(network);

    let switched = false;

    // Check if we're using an embedded wallet - if so, only use Privy's switchChain
    const isEmbeddedWallet = wallets && wallets.length > 0 &&
      (wallets[0].connectorType === 'embedded' || wallets[0].walletClientType === 'privy');

    // Priority 1: For embedded wallets, use Privy's switchChain (avoids external wallet popups)
    if (isEmbeddedWallet && wallets && wallets.length > 0) {
      const wallet = wallets[0];
      const walletChainId = wallet.chainId
        ? parseInt(wallet.chainId.split(":")[1] || wallet.chainId)
        : null;

      if (walletChainId !== network.id) {
        try {
          await wallet.switchChain(network.id);
          switched = true;
        } catch (error: any) {
          console.error("Failed to switch Privy embedded wallet chain:", error);
          // Revert UI state
          if (wallet.chainId) {
            const currentNetwork = SUPPORTED_NETWORKS.find((n) => n.chainId === wallet.chainId);
            if (currentNetwork) setSelectedNetwork(currentNetwork);
          }
        }
      } else {
        switched = true; // Already on correct chain
      }
    }
    // Priority 2: For external wallets, use window.ethereum
    else if (!isEmbeddedWallet && window.ethereum) {
      try {
        const chainIdHex = `0x${network.id.toString(16)}`;

        // Check current chain
        const currentChainId = await (window.ethereum as any).request({
          method: "eth_chainId",
        });

        if (currentChainId === chainIdHex) {
          switched = true;
        } else {
          try {
            await (window.ethereum as any).request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: chainIdHex }],
            });
            switched = true;
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              // Chain not added - log warning but don't auto-add to prevent redirects
              console.warn(`Chain ${network.name} (${chainIdHex}) is not added to your wallet. Please add it manually.`);
              // Revert UI state
              if (wallets && wallets.length > 0) {
                const wallet = wallets[0];
                if (wallet.chainId) {
                  const currentNetwork = SUPPORTED_NETWORKS.find((n) => n.chainId === wallet.chainId);
                  if (currentNetwork) setSelectedNetwork(currentNetwork);
                }
              }
            } else if (switchError.code === 4001) {
              // Revert UI state
              if (wallets && wallets.length > 0) {
                const wallet = wallets[0];
                if (wallet.chainId) {
                  const currentNetwork = SUPPORTED_NETWORKS.find((n) => n.chainId === wallet.chainId);
                  if (currentNetwork) setSelectedNetwork(currentNetwork);
                }
              }
            } else {
              console.error("Error switching chain:", switchError);
            }
          }
        }
      } catch (error) {
        console.error("Error with window.ethereum:", error);
      }
    }

    // Refresh balances after network switch
    // Pass target chainId directly to avoid race conditions with wallet state updates
    if (switched) {
      // Use a small delay to ensure the switch operation has completed
      // but pass the target chainId directly to fetchBalances
      setTimeout(() => {
        refreshBalances(network.id);
      }, 300);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Select
        value={selectedNetwork.id.toString()}
        onValueChange={handleNetworkChange}
      >
        <SelectTrigger className="w-auto min-w-[100px] sm:w-[140px] min-h-9 px-3 py-1.5 bg-white border-gray-200 text-gray-900 hover:bg-gray-50 text-xs sm:text-sm rounded-xl">
          <SelectValue>
            <span className="flex items-center gap-2">
              <Image
                src={getNetworkLogoPath(selectedNetwork)}
                alt={selectedNetwork.name}
                width={16}
                height={16}
                className="rounded-full flex-shrink-0"
              />
              <span className="text-xs sm:text-sm font-medium truncate">{selectedNetwork.name}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_NETWORKS.map((network) => (
            <SelectItem
              key={network.id}
              value={network.id.toString()}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Image
                  src={getNetworkLogoPath(network)}
                  alt={network.name}
                  width={20}
                  height={20}
                  className="rounded-full flex-shrink-0"
                />
                <span className="font-medium">{network.name}</span>
                <span className="text-xs text-gray-500">
                  ({network.nativeCurrency.symbol})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </motion.div>
  );
}

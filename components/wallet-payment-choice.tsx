"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import { useBalance } from "@/contexts/balance-context";
import { 
  hasMultipleWalletOptions, 
  getPrivyWalletFromUser, 
  getExternalWalletsFromUser 
} from "@/lib/privy-utils";
import type { SupportedToken } from "@/types";
import { Check, Wallet, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { getTokenLogoPath } from "@/lib/network-utils";

export type WalletPaymentOption = 'privy' | 'external';

interface WalletPaymentChoiceProps {
  selectedToken: SupportedToken;
  selectedOption: WalletPaymentOption;
  onOptionChange: (option: WalletPaymentOption, walletAddress: string) => void;
  className?: string;
  disabled?: boolean;
}

export function WalletPaymentChoice({
  selectedToken,
  selectedOption,
  onOptionChange,
  className,
  disabled = false,
}: WalletPaymentChoiceProps) {
  const { user } = usePrivy();
  const { privyBalances, injectedBalances, isLoading: isLoadingBalance } = useBalance();

  // Don't show if user doesn't have multiple wallet options
  if (!user || !hasMultipleWalletOptions(user)) {
    return null;
  }

  const privyWallet = getPrivyWalletFromUser(user);
  const externalWallets = getExternalWalletsFromUser(user);
  const primaryExternalWallet = externalWallets[0]; // Use first external wallet

  if (!privyWallet || !primaryExternalWallet) {
    return null;
  }

  // Get balances
  const privyBalance = privyBalances[selectedToken];
  const externalBalance = injectedBalances[selectedToken];

  const formatBalance = (balance: any) => {
    if (!balance) return "0.00";
    const balanceValue = parseFloat(balance.formatted);
    if (balanceValue === 0) return "0.00";
    if (balanceValue < 0.01) return "<0.01";
    return balanceValue.toFixed(2);
  };

  const handlePrivyWalletClick = () => {
    if (!disabled) {
      onOptionChange('privy', privyWallet.address);
    }
  };

  const handleExternalWalletClick = () => {
    if (!disabled) {
      onOptionChange('external', primaryExternalWallet.address);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-700">Choose payment method</span>
      </div>
      
      <div className="space-y-2">
        {/* Privy Wallet Option (Gas Sponsored) */}
        <motion.button
          onClick={handlePrivyWalletClick}
          disabled={disabled}
          className={cn(
            "w-full p-4 rounded-xl border-2 transition-all duration-200",
            "flex items-center justify-between group",
            selectedOption === 'privy' 
              ? "border-blue-500 bg-blue-50" 
              : "border-gray-200 hover:border-gray-300 bg-white",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          whileHover={!disabled ? { scale: 1.02 } : undefined}
          whileTap={!disabled ? { scale: 0.98 } : undefined}
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                selectedOption === 'privy' 
                  ? "border-blue-500 bg-blue-500" 
                  : "border-gray-300 group-hover:border-gray-400"
              )}>
                {selectedOption === 'privy' && <Check className="h-3 w-3 text-white" />}
              </div>
            </div>
            
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900">{privyWallet.connectorName}</span>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700">
                  <Zap className="h-3 w-3" />
                  <span className="text-xs font-medium">Sponsored</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {privyWallet.address.slice(0, 6)}...{privyWallet.address.slice(-4)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Image
              src={getTokenLogoPath(selectedToken)}
              alt={selectedToken}
              width={20}
              height={20}
              className="rounded-full flex-shrink-0"
            />
            {isLoadingBalance ? (
              <div className="animate-pulse w-12 h-4 bg-gray-200 rounded" />
            ) : (
              <span className="text-sm font-medium text-gray-900">
                {formatBalance(privyBalance)} {selectedToken}
              </span>
            )}
          </div>
        </motion.button>

        {/* External Wallet Option (User Pays Gas) */}
        <motion.button
          onClick={handleExternalWalletClick}
          disabled={disabled}
          className={cn(
            "w-full p-4 rounded-xl border-2 transition-all duration-200",
            "flex items-center justify-between group",
            selectedOption === 'external' 
              ? "border-orange-500 bg-orange-50" 
              : "border-gray-200 hover:border-gray-300 bg-white",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          whileHover={!disabled ? { scale: 1.02 } : undefined}
          whileTap={!disabled ? { scale: 0.98 } : undefined}
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                selectedOption === 'external' 
                  ? "border-orange-500 bg-orange-500" 
                  : "border-gray-300 group-hover:border-gray-400"
              )}>
                {selectedOption === 'external' && <Check className="h-3 w-3 text-white" />}
              </div>
            </div>
            
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900">{primaryExternalWallet.connectorName}</span>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs font-medium">You pay gas</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {primaryExternalWallet.address.slice(0, 6)}...{primaryExternalWallet.address.slice(-4)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Image
              src={getTokenLogoPath(selectedToken)}
              alt={selectedToken}
              width={20}
              height={20}
              className="rounded-full flex-shrink-0"
            />
            {isLoadingBalance ? (
              <div className="animate-pulse w-12 h-4 bg-gray-200 rounded" />
            ) : (
              <span className="text-sm font-medium text-gray-900">
                {formatBalance(externalBalance)} {selectedToken}
              </span>
            )}
          </div>
        </motion.button>
      </div>

      {/* Info note */}
      <AnimatePresence>
        {selectedOption === 'external' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200"
          >
            <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-700">
              <span className="font-medium">Network fees apply:</span> You&apos;ll need ETH on {" "}
              the current network to pay for transaction gas fees.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Hook to check if wallet payment choice should be shown
 */
export function useWalletPaymentChoice(user: any) {
  return user && hasMultipleWalletOptions(user);
}
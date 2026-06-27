"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, Mail, Copy, Check, ChevronDown, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { NetworksDropdown } from "@/components/networks-dropdown";
import { MobileDropdown } from "@/components/mobile-dropdown";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { SUPPORTED_NETWORKS, getNetworkByChainId } from "@/lib/networks";
import { getNetworkLogoPath } from "@/lib/network-utils";
import Image from "next/image";
import { TransactionHistoryDrawer } from "@/components/transaction-history-drawer";

export function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const hasSyncedRef = useRef(false);

  // Sync user to database when authenticated
  useEffect(() => {
    const syncUser = async () => {
      if (!ready || !authenticated || !user || hasSyncedRef.current) {
        return;
      }

      // Extract wallet address
      const walletAddress = getWalletAddressFromPrivyUser(user);

      // Wait a bit for embedded wallets to be created
      if (!walletAddress && user.id) {
        // Retry after a short delay for embedded wallets
        setTimeout(() => {
          const retryWalletAddress = getWalletAddressFromPrivyUser(user);
          if (retryWalletAddress) {
            syncUserToDB(user, retryWalletAddress);
          }
        }, 1000);
        return;
      }

      if (!walletAddress && !user.id) {
        return;
      }

      syncUserToDB(user, walletAddress);
    };

    const syncUserToDB = async (privyUser: any, walletAddr: string | null) => {
      if (hasSyncedRef.current) return;

      hasSyncedRef.current = true;

      try {
        const response = await fetch('/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privyUserId: privyUser.id,
            walletAddress: walletAddr,
            user: privyUser, // Send full user object for extraction
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('Failed to sync user:', error);
          hasSyncedRef.current = false; // Retry on next render if failed
        }
      } catch (error) {
        console.error('Failed to sync user:', error);
        hasSyncedRef.current = false; // Retry on next render if failed
      }
    };

    syncUser();
  }, [ready, authenticated, user, wallets]);

  // Reset sync flag when user logs out
  useEffect(() => {
    if (!authenticated) {
      hasSyncedRef.current = false;
    }
  }, [authenticated]);

  const handleSignIn = () => {
    if (authenticated) {
      logout();
    } else {
      login();
    }
  };

  const handleCopyAddress = async (address: string) => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Wallet address copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  if (!ready) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="relative text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            cryptobilz
            <span className="absolute -top-1 -right-8 text-[10px] font-semibold bg-orange-500 text-white px-1.5 py-0.5 rounded leading-none">
              beta
            </span>
          </div>
          <div className="h-10 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent"
        >
          cryptobilz
          <span className="absolute -top-1 -right-8 text-[10px] font-semibold bg-orange-500 text-white px-1.5 py-0.5 rounded leading-none">
            beta
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 sm:gap-3"
        >
          {authenticated ? (
            <>
              {/* Desktop: Networks Dropdown and Wallet Address */}
              {wallets && wallets.length > 0 && (
                <>
                  <div className="hidden sm:block">
                    <NetworksDropdown />
                  </div>
                  {(() => {
                    const walletAddress = user ? getWalletAddressFromPrivyUser(user) : null;
                    const currentNetwork = wallets[0]?.chainId
                      ? getNetworkByChainId(wallets[0].chainId)
                      : SUPPORTED_NETWORKS[0];

                    if (walletAddress) {
                      return (
                        <>
                          {/* Mobile: Single wallet button that opens dropdown */}
                          <button
                            onClick={() => setIsMobileDropdownOpen(true)}
                            className="sm:hidden flex items-center gap-2 min-h-9 px-4 py-2 bg-gray-50 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-700"
                          >
                            <Image
                              src={currentNetwork ? getNetworkLogoPath(currentNetwork) : getNetworkLogoPath(1)}
                              alt={currentNetwork?.name || "Network"}
                              width={20}
                              height={20}
                              className="rounded-full flex-shrink-0"
                            />
                            <span className="font-medium">
                              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                            </span>
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          </button>
                          {/* Desktop: Full address display */}
                          <button
                            onClick={() => handleCopyAddress(walletAddress)}
                            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-2xl border border-gray-200 hover:bg-gray-200 transition-colors cursor-pointer"
                            title="Click to copy address"
                          >
                            <Wallet className="h-4 w-4 text-gray-600" />
                            <span className="text-sm text-gray-700">
                              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                            </span>
                            {copied ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3 text-gray-500" />
                            )}
                          </button>
                        </>
                      );
                    } else if (user?.email?.address) {
                      return (
                        <>
                          {/* Mobile: Email button that opens dropdown */}
                          <button
                            onClick={() => setIsMobileDropdownOpen(true)}
                            className="sm:hidden flex items-center gap-2 min-h-9 px-4 py-2 bg-gray-50 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-700"
                          >
                            <Mail className="h-4 w-4 text-gray-600" />
                            <span className="font-medium">
                              {user.email.address.slice(0, 10)}...
                            </span>
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          </button>
                          {/* Desktop: Full email display */}
                          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-2xl border border-gray-200">
                            <Mail className="h-4 w-4 text-gray-600" />
                            <span className="text-sm text-gray-700">
                              {user.email.address}
                            </span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </>
              )}

              {/* Fallback for users without wallets (email-only) */}
              {(!wallets || wallets.length === 0) && user?.email?.address && (
                <>
                  <button
                    onClick={() => setIsMobileDropdownOpen(true)}
                    className="sm:hidden flex items-center gap-2 min-h-9 px-4 py-2 bg-gray-50 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-700"
                  >
                    <Mail className="h-4 w-4 text-gray-600" />
                    <span className="font-medium">
                      {user.email.address.slice(0, 10)}...
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-2xl border border-gray-200">
                    <Mail className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-700">
                      {user.email.address}
                    </span>
                  </div>
                </>
              )}

              {/* Desktop: Transaction history button */}
              <Button
                onClick={() => setIsHistoryDrawerOpen(true)}
                variant="outline"
                className="hidden sm:flex bg-white border-gray-300 text-gray-900 hover:bg-gray-50 text-sm min-h-9 px-4 py-2"
                title="View transaction history"
              >
                <History className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              onClick={handleSignIn}
              className="bg-gray-900 border border-gray-900 text-white hover:bg-gray-800 hover:border-gray-800 text-sm sm:text-base min-h-9 px-4 py-2 rounded-xl"
            >
              Sign in
            </Button>
          )}
        </motion.div>
      </div>

      {/* Mobile Dropdown */}
      <AnimatePresence>
        <MobileDropdown
          isOpen={isMobileDropdownOpen}
          onClose={() => setIsMobileDropdownOpen(false)}
          onOpenHistory={() => setIsHistoryDrawerOpen(true)}
        />
      </AnimatePresence>

      {/* Transaction History Drawer */}
      <TransactionHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
      />
    </header>
  );
}

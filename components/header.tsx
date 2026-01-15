"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, Mail, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import {
  getWalletAddressFromPrivyUser,
  getLoginProviderFromPrivyUser,
  getWalletTypeFromPrivyUser,
  getEmailFromPrivyUser,
} from "@/lib/privy-utils";
import { NetworksDropdown } from "@/components/networks-dropdown";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";

export function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const hasSyncedRef = useRef(false);

  // Sync user to database when they authenticate
  useEffect(() => {
    if (!ready || !authenticated || !user || hasSyncedRef.current) {
      return;
    }

    const syncUser = async () => {
      const walletAddress = getWalletAddressFromPrivyUser(user);
      if (!walletAddress) {
        return;
      }

      try {
        const loginProvider = getLoginProviderFromPrivyUser(user);
        const walletType = getWalletTypeFromPrivyUser(user);
        const email = getEmailFromPrivyUser(user);

        const response = await fetch('/api/users/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress,
            privyUserId: user.id,
            loginProvider,
            walletType,
            email,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to sync user');
        }

        const data = await response.json();
        hasSyncedRef.current = true;

        // Optionally show a toast for new users
        // if (data.user?.isNewUser) {
        //   toast({
        //     title: "Welcome!",
        //     description: "Your account has been created",
        //   });
        // }
      } catch (error) {
        console.error('Failed to sync user:', error);
        // Don't show error toast to user - this is a background operation
      }
    };

    syncUser();
  }, [ready, authenticated, user, toast]);

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
      <header className="w-full border-b border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            cryptobilz
          </div>
          <div className="h-10 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>
    );
  }

  return (
    <header className="w-full border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent"
        >
          cryptobilz
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          {authenticated ? (
            <>
              {/* Networks Dropdown - Only show if wallet is connected */}
              {wallets && wallets.length > 0 && (
                <div className="hidden sm:block">
                  <NetworksDropdown />
                </div>
              )}

              {/* Wallet/Email Display */}
              {(() => {
                const walletAddress = user ? getWalletAddressFromPrivyUser(user) : null;
                if (walletAddress) {
                  return (
                    <button
                      onClick={() => handleCopyAddress(walletAddress)}
                      className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 transition-colors cursor-pointer"
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
                  );
                } else if (user?.email?.address) {
                  return (
                    <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200">
                      <Mail className="h-4 w-4 text-gray-600" />
                      <span className="text-sm text-gray-700">
                        {user.email.address}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              <Button
                onClick={handleSignIn}
                variant="outline"
                className="bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </>
          ) : (
            <Button
              onClick={handleSignIn}
              className="bg-gray-900 border border-gray-900 text-white hover:bg-gray-800 hover:border-gray-800"
            >
              Sign in
            </Button>
          )}
        </motion.div>
      </div>
    </header>
  );
}

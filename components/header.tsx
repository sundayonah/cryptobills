"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, Mail, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { NetworksDropdown } from "@/components/networks-dropdown";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

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
      <header className="w-full border-b border-[#4a4b52] bg-[#2d2e33]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            cryptobilz
          </div>
          <div className="h-10 w-20 bg-[#36373d] rounded animate-pulse" />
        </div>
      </header>
    );
  }

  return (
    <header className="w-full border-b border-[#4a4b52] bg-[#2d2e33]">
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
                      className="hidden sm:flex items-center gap-2 px-3 py-2 bg-[#36373d] rounded-lg border border-[#4a4b52] hover:bg-[#404149] transition-colors cursor-pointer"
                      title="Click to copy address"
                    >
                      <Wallet className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-200">
                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                      </span>
                      {copied ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-gray-400" />
                      )}
                    </button>
                  );
                } else if (user?.email?.address) {
                  return (
                    <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-[#36373d] rounded-lg border border-[#4a4b52]">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-200">
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
                className="bg-[#36373d] border-[#4a4b52] text-gray-200 hover:bg-[#404149]"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </>
          ) : (
            <Button
              onClick={handleSignIn}
              className="bg-purple-600 border border-purple-600 text-white hover:bg-purple-700 hover:border-purple-700"
            >
              Sign in
            </Button>
          )}
        </motion.div>
      </div>
    </header>
  );
}

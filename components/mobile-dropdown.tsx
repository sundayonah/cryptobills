"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useBalance } from "@/contexts/balance-context";
import { NetworksDropdown } from "@/components/networks-dropdown";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Copy, Check, X, ChevronDown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORTED_NETWORKS, getNetworkByChainId } from "@/lib/networks";
import React from "react";

interface MobileDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenHistory?: () => void;
}

export function MobileDropdown({ isOpen, onClose, onOpenHistory }: MobileDropdownProps) {
    const { authenticated, logout, user } = usePrivy();
    const { wallets } = useWallets();
    const { toast } = useToast();
    const [copied, setCopied] = React.useState(false);

    const walletAddress = user ? getWalletAddressFromPrivyUser(user) : null;
    const currentNetwork = wallets && wallets.length > 0 && wallets[0].chainId
        ? getNetworkByChainId(wallets[0].chainId)
        : SUPPORTED_NETWORKS[0];

    const handleCopyAddress = async () => {
        if (!walletAddress) return;
        const success = await copyToClipboard(walletAddress);
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

    const handleSignOut = () => {
        logout();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] sm:hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 flex items-end pointer-events-none">
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="w-full pointer-events-auto"
                        >
                            <div className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-[30px] border border-gray-200 bg-white px-5 pt-6 pb-8 shadow-xl">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-gray-900">Wallet</h2>
                                    <button
                                        onClick={onClose}
                                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* Network Selector */}
                                    {wallets && wallets.length > 0 && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Network</label>
                                            <NetworksDropdown />
                                        </div>
                                    )}

                                    {/* Wallet Address */}
                                    {walletAddress && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Wallet Address</label>
                                            <button
                                                onClick={handleCopyAddress}
                                                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
                                            >
                                                <Wallet className="h-5 w-5 text-gray-600 flex-shrink-0" />
                                                <span className="flex-1 text-left text-sm font-medium text-gray-900 break-all">
                                                    {walletAddress}
                                                </span>
                                                {copied ? (
                                                    <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                                ) : (
                                                    <Copy className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {/* Transaction History Button */}
                                    {onOpenHistory && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Transaction History</label>
                                            <Button
                                                onClick={() => {
                                                    onOpenHistory();
                                                    onClose();
                                                }}
                                                variant="outline"
                                                className="w-full bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                                            >
                                                <History className="h-4 w-4 mr-2" />
                                                View Transaction History
                                            </Button>
                                        </div>
                                    )}

                                    {/* Sign Out Button */}
                                    <div className="pt-4 border-t border-gray-200">
                                        <Button
                                            onClick={handleSignOut}
                                            variant="outline"
                                            className="w-full bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                                        >
                                            Sign out
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
}

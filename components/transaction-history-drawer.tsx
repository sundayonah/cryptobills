"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    LogOut,
    Clock,
    CheckCircle,
    XCircle,
    Loader2,
    Copy,
    Check,
    RefreshCw,
    ExternalLink,
    ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard, getExplorerLink, isSupportedNetwork } from "@/lib/utils";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";

interface Transaction {
    id: string;
    category: string;
    serviceName?: string;
    status: string;
    token: string;
    tokenAmount: string;
    ngnAmount: number;
    serviceAmount: number;
    phoneNumber?: string;
    meterNumber?: string;
    accountNumber?: string;
    electricityToken?: string;
    electricityUnit?: string;
    paybetaReference: string;
    paybetaTransactionId?: string;
    createdAt: string;
    completedAt?: string;
    errorMessage?: string;
    paymentTxHash?: string;
    networkName?: string;
}

interface TransactionHistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TransactionHistoryDrawer({ isOpen, onClose }: TransactionHistoryDrawerProps) {
    const { authenticated, user, logout } = usePrivy();
    const { toast } = useToast();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [syncingTxId, setSyncingTxId] = useState<string | null>(null);
    const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(() => new Set());

    const isTxExpanded = (id: string) => expandedTxIds.has(id);

    const toggleTxExpanded = (id: string) => {
        setExpandedTxIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const fetchTransactions = useCallback(async () => {
        if (!user) return;

        // Get all wallet addresses associated with the user (Privy + external)
        const walletAddresses: string[] = [];
        
        // Add Privy wallet address
        const privyWalletAddress = getWalletAddressFromPrivyUser(user);
        if (privyWalletAddress) {
            walletAddresses.push(privyWalletAddress);
        }
        
        // Add external wallet addresses
        const externalWallets = user.linkedAccounts?.filter((account: any) =>
            account.type === 'wallet' &&
            account.connectorType !== 'embedded' &&
            (account as any).address
        ) || [];
        
        for (const wallet of externalWallets) {
            walletAddresses.push((wallet as any).address);
        }
        
        if (walletAddresses.length === 0) return;

        setLoading(true);
        try {
            // Fetch transactions for all wallet addresses
            const allTransactions: Transaction[] = [];
            
            for (const walletAddress of walletAddresses) {
                const response = await fetch(`/api/transactions?walletAddress=${walletAddress}&limit=50`);
                if (response.ok) {
                    const data = await response.json();
                    allTransactions.push(...(data.transactions || []));
                }
            }
            
            // Remove duplicates and sort by creation date
            const uniqueTransactions = Array.from(
                new Map(allTransactions.map(tx => [tx.id, tx])).values()
            ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            
            setTransactions(uniqueTransactions);
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (isOpen && authenticated && user) {
            fetchTransactions();
        }
    }, [isOpen, authenticated, user, fetchTransactions]);

    useEffect(() => {
        if (!isOpen) {
            setExpandedTxIds(new Set());
        }
    }, [isOpen]);

    const handleCopy = async (text: string, id: string, label: string = "Reference") => {
        const success = await copyToClipboard(text);
        if (success) {
            setCopied(id);
            toast({
                title: "Copied!",
                description: `${label} copied to clipboard`,
            });
            setTimeout(() => setCopied(null), 2000);
        }
    };

    const handleSyncTransaction = async (txId: string) => {
        setSyncingTxId(txId);
        try {
            const response = await fetch(`/api/transactions/${txId}/sync-status`, {
                method: "POST",
            });

            if (response.ok) {
                const data = await response.json();
                // Update the transaction in the local state
                setTransactions((prev) =>
                    prev.map((tx) =>
                        tx.id === txId
                            ? {
                                ...tx,
                                status: data.transaction.status,
                                electricityToken: data.transaction.electricityToken || tx.electricityToken,
                                electricityUnit: data.transaction.electricityUnit || tx.electricityUnit,
                                paybetaTransactionId: data.transaction.paybetaTransactionId || tx.paybetaTransactionId,
                                errorMessage: data.transaction.errorMessage || tx.errorMessage,
                                completedAt: data.transaction.completedAt || tx.completedAt,
                            }
                            : tx
                    )
                );
                // Refetch transactions to ensure we have the latest data
                await fetchTransactions();
                toast({
                    title: "Synced!",
                    description: "Transaction status updated successfully",
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Sync Failed",
                    description: error.error || "Failed to sync transaction status",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error syncing transaction:", error);
            toast({
                title: "Sync Failed",
                description: "Failed to sync transaction status",
                variant: "destructive",
            });
        } finally {
            setSyncingTxId(null);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "completed":
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case "failed":
                return <XCircle className="h-4 w-4 text-red-600" />;
            case "processing":
                return <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />;
            default:
                return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed":
                return "text-green-600 bg-green-50 border-green-200";
            case "failed":
                return "text-red-600 bg-red-50 border-red-200";
            case "processing":
                return "text-yellow-600 bg-yellow-50 border-yellow-200";
            default:
                return "text-gray-600 bg-gray-50 border-gray-200";
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getCategoryLabel = (category: string) => {
        const labels: Record<string, string> = {
            airtime: "Airtime",
            data_bundle: "Data Bundle",
            cable_tv: "Cable TV",
            electricity: "Electricity",
            showmax: "Showmax",
            gaming: "Gaming",
        };
        return labels[category] || category;
    };

    const getRecipientDisplay = (tx: Transaction) => {
        if (tx.phoneNumber) return tx.phoneNumber;
        if (tx.meterNumber) return `Meter: ${tx.meterNumber}`;
        if (tx.accountNumber) return `Account: ${tx.accountNumber}`;
        return "N/A";
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/50 z-50"
                        onClick={onClose}
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-full sm:max-w-md sm:top-4 sm:bottom-4 sm:right-4 rounded-2xl bg-white shadow-2xl z-50 overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 rounded-2xl transition-colors"
                            >
                                <X className="h-5 w-5 text-gray-600" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Clock className="h-12 w-12 text-gray-300 mb-4" />
                                    <p className="text-gray-600 font-medium">No transactions yet</p>
                                    <p className="text-sm text-gray-500 mt-1">Your transaction history will appear here</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transactions.map((tx) => {
                                        const expanded = isTxExpanded(tx.id);
                                        return (
                                        <motion.div
                                            key={tx.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="overflow-hidden rounded-2xl border border-gray-200 transition-shadow hover:shadow-md"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleTxExpanded(tx.id)}
                                                aria-expanded={expanded}
                                                className="w-full p-4 text-left hover:bg-gray-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-inset"
                                            >
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                            <h3 className="font-semibold text-gray-900">
                                                                {getCategoryLabel(tx.category)}
                                                            </h3>
                                                            {tx.serviceName && (
                                                                <span className="text-sm text-gray-500">• {tx.serviceName}</span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-600 break-all">
                                                            {getRecipientDisplay(tx)}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                                                        <div
                                                            className={`flex w-fit items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium ${getStatusColor(tx.status)}`}
                                                        >
                                                            {getStatusIcon(tx.status)}
                                                            <span className="capitalize">{tx.status}</span>
                                                        </div>
                                                        <ChevronDown
                                                            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                                                            aria-hidden
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-3">
                                                    <p className="text-xs text-gray-500">Amount Paid</p>
                                                    <p className="text-lg font-bold text-gray-900">
                                                        ₦{(tx.serviceAmount ?? tx.ngnAmount ?? 0).toLocaleString()}
                                                    </p>
                                                </div>
                                                <p className="mt-2 text-xs text-gray-400">
                                                    {expanded ? "Tap to hide details" : "Tap to show details"}
                                                </p>
                                            </button>

                                            {expanded && (
                                                <div className="space-y-2 border-t border-gray-100 px-4 pb-4 pt-3">
                                                    {tx.category !== "gaming" && (
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs text-gray-500">Token paid</p>
                                                                <p className="text-sm font-semibold whitespace-nowrap text-gray-700">
                                                                    {(() => {
                                                                        const tokenAmount = parseFloat(tx.tokenAmount);
                                                                        return isFinite(tokenAmount)
                                                                            ? tokenAmount.toFixed(8)
                                                                            : "0.00000000";
                                                                    })()}{" "}
                                                                    {tx.token}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {tx.category !== "gaming" && tx.electricityToken && (
                                                        <div className="flex items-center justify-between gap-2 text-sm">
                                                            <span className="text-gray-600">Token:</span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleCopy(
                                                                        tx.electricityToken!,
                                                                        `${tx.id}-token`,
                                                                        "Token"
                                                                    );
                                                                }}
                                                                className="flex min-w-0 items-center gap-1 break-all text-right font-mono font-semibold text-purple-600 hover:text-purple-700"
                                                                title="Copy token"
                                                            >
                                                                <span className="max-w-[200px] truncate sm:max-w-none">
                                                                    {tx.electricityToken}
                                                                </span>
                                                                {copied === `${tx.id}-token` ? (
                                                                    <Check className="h-3 w-3 shrink-0" />
                                                                ) : (
                                                                    <Copy className="h-3 w-3 shrink-0" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                    {tx.category !== "gaming" && tx.electricityUnit && (
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-gray-600">Units:</span>
                                                            <span className="font-semibold text-gray-900">
                                                                {tx.electricityUnit} kWh
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600">Date:</span>
                                                        <span className="text-gray-900">{formatDate(tx.createdAt)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2 text-sm">
                                                        <span className="shrink-0 text-gray-600">Reference:</span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void handleCopy(tx.paybetaReference, tx.id, "Reference");
                                                            }}
                                                            className="flex min-w-0 items-center gap-1 font-mono text-xs text-purple-600 hover:text-purple-700"
                                                            title="Copy reference"
                                                        >
                                                            <span className="max-w-[150px] truncate sm:max-w-none">
                                                                {tx.paybetaReference.slice(0, 8)}...
                                                            </span>
                                                            {copied === tx.id ? (
                                                                <Check className="h-3 w-3 shrink-0" />
                                                            ) : (
                                                                <Copy className="h-3 w-3 shrink-0" />
                                                            )}
                                                        </button>
                                                    </div>
                                                    {tx.paymentTxHash &&
                                                        isSupportedNetwork(tx.networkName) &&
                                                        getExplorerLink(tx.networkName, tx.paymentTxHash) && (
                                                            <div className="flex items-center justify-between text-sm">
                                                                <span className="text-gray-600">View in explorer:</span>
                                                                <a
                                                                    href={getExplorerLink(tx.networkName, tx.paymentTxHash)!}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="flex min-w-0 items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline"
                                                                    title="View on blockchain explorer"
                                                                >
                                                                    <span className="max-w-[120px] truncate sm:max-w-none">
                                                                        {tx.paymentTxHash.slice(0, 6)}...
                                                                        {tx.paymentTxHash.slice(-4)}
                                                                    </span>
                                                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                                                </a>
                                                            </div>
                                                        )}
                                                    {tx.errorMessage && (
                                                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                                                            {tx.errorMessage}
                                                        </div>
                                                    )}
                                                    {tx.category === "electricity" &&
                                                        (tx.status === "processing" ||
                                                            tx.status === "payment_received" ||
                                                            (!tx.electricityToken && tx.status !== "failed")) && (
                                                            <div className="mt-3 border-t border-gray-100 pt-3">
                                                                <Button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        void handleSyncTransaction(tx.id);
                                                                    }}
                                                                    disabled={syncingTxId === tx.id}
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="w-full text-xs"
                                                                >
                                                                    {syncingTxId === tx.id ? (
                                                                        <>
                                                                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                                                            Syncing...
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <RefreshCw className="mr-2 h-3 w-3" />
                                                                            Sync Status
                                                                        </>
                                                                    )}
                                                                </Button>
                                                            </div>
                                                        )}
                                                </div>
                                            )}
                                        </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer with Sign Out */}
                        <div className="border-t border-gray-200 p-4">
                            <Button
                                onClick={() => {
                                    logout();
                                    onClose();
                                }}
                                variant="outline"
                                className="w-full border-gray-300 text-gray-900 hover:bg-gray-50"
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Sign out
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
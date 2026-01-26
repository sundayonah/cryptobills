"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut, Clock, CheckCircle, XCircle, Loader2, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
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

    const fetchTransactions = useCallback(async () => {
        if (!user) return;

        const walletAddress = getWalletAddressFromPrivyUser(user);
        if (!walletAddress) return;

        setLoading(true);
        try {
            const response = await fetch(`/api/transactions?walletAddress=${walletAddress}&limit=50`);
            if (response.ok) {
                const data = await response.json();
                setTransactions(data.transactions || []);
            } else {
                console.error("Failed to fetch transactions");
            }
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
                                    {transactions.map((tx) => (
                                        <motion.div
                                            key={tx.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="border border-gray-200 rounded-2xl p-4 hover:shadow-md transition-shadow"
                                        >
                                            {/* Header with status */}
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                                        <h3 className="font-semibold text-gray-900">{getCategoryLabel(tx.category)}</h3>
                                                        {tx.serviceName && (
                                                            <span className="text-sm text-gray-500">• {tx.serviceName}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-600 break-all">{getRecipientDisplay(tx)}</p>
                                                </div>
                                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium w-fit ${getStatusColor(tx.status)}`}>
                                                    {getStatusIcon(tx.status)}
                                                    <span className="capitalize">{tx.status}</span>
                                                </div>
                                            </div>

                                            {/* Amount */}
                                            <div className="flex items-center justify-between gap-4 mb-3 pb-3 border-b border-gray-100">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-500">Amount Paid</p>
                                                    <p className="text-lg font-bold text-gray-900">₦{(tx.serviceAmount ?? tx.ngnAmount ?? 0).toLocaleString()}</p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-xs text-gray-500">Token</p>
                                                    <p className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        {(() => {
                                                            const tokenAmount = parseFloat(tx.tokenAmount);
                                                            return isFinite(tokenAmount) ? tokenAmount.toFixed(8) : "0.00000000";
                                                        })()} {tx.token}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Details */}
                                            <div className="space-y-2">
                                                {tx.electricityToken && (
                                                    <div className="flex items-center justify-between text-sm gap-2">
                                                        <span className="text-gray-600">Token:</span>
                                                        <button
                                                            onClick={() => handleCopy(tx.electricityToken!, `${tx.id}-token`, "Token")}
                                                            className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-mono font-semibold break-all text-right"
                                                            title="Copy token"
                                                        >
                                                            <span className="max-w-[200px] truncate sm:max-w-none">{tx.electricityToken}</span>
                                                            {copied === `${tx.id}-token` ? (
                                                                <Check className="h-3 w-3 flex-shrink-0" />
                                                            ) : (
                                                                <Copy className="h-3 w-3 flex-shrink-0" />
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                                {tx.electricityUnit && (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600">Units:</span>
                                                        <span className="font-semibold text-gray-900">{tx.electricityUnit} kWh</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">Date:</span>
                                                    <span className="text-gray-900">{formatDate(tx.createdAt)}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm gap-2">
                                                    <span className="text-gray-600 flex-shrink-0">Reference:</span>
                                                    <button
                                                        onClick={() => handleCopy(tx.paybetaReference, tx.id, "Reference")}
                                                        className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-mono text-xs min-w-0"
                                                        title="Copy reference"
                                                    >
                                                        <span className="truncate max-w-[150px] sm:max-w-none">{tx.paybetaReference.slice(0, 8)}...</span>
                                                        {copied === tx.id ? (
                                                            <Check className="h-3 w-3 flex-shrink-0" />
                                                        ) : (
                                                            <Copy className="h-3 w-3 flex-shrink-0" />
                                                        )}
                                                    </button>
                                                </div>
                                                {tx.paymentTxHash && isSupportedNetwork(tx.networkName) && getExplorerLink(tx.networkName, tx.paymentTxHash) && (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600">View in explorer:</span>
                                                        <a
                                                            href={getExplorerLink(tx.networkName, tx.paymentTxHash)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-mono text-xs hover:underline"
                                                            title="View on blockchain explorer"
                                                        >
                                                            <span className="truncate max-w-[120px] sm:max-w-none">
                                                                {tx.paymentTxHash.slice(0, 6)}...{tx.paymentTxHash.slice(-4)}
                                                            </span>
                                                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                                        </a>
                                                    </div>
                                                )}
                                                {tx.errorMessage && (
                                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                                        {tx.errorMessage}
                                                    </div>
                                                )}
                                                {/* Sync button for electricity transactions without token/unit or processing status */}
                                                {tx.category === "electricity" &&
                                                    (tx.status === "processing" ||
                                                        tx.status === "payment_received" ||
                                                        (!tx.electricityToken && tx.status !== "failed")) && (
                                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                                            <Button
                                                                onClick={() => handleSyncTransaction(tx.id)}
                                                                disabled={syncingTxId === tx.id}
                                                                variant="outline"
                                                                size="sm"
                                                                className="w-full text-xs"
                                                            >
                                                                {syncingTxId === tx.id ? (
                                                                    <>
                                                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                                                        Syncing...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <RefreshCw className="h-3 w-3 mr-2" />
                                                                        Sync Status
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </div>
                                                    )}
                                            </div>
                                        </motion.div>
                                    ))}
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
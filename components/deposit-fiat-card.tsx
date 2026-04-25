"use client";

import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { useSelectedNetwork } from "@/contexts/selected-network-context";
import { getNetworkById } from "@/lib/networks";
import type { SupportedToken } from "@/types";

type OnrampOrder = {
  id: string;
  status: string;
  providerAccount: {
    institution: string;
    accountName: string;
    accountIdentifier: string;
  } | null;
};

export function DepositFiatCard() {
  const { authenticated, user, login, connectWallet } = usePrivy();
  const { toast } = useToast();
  const { chainId } = useSelectedNetwork();

  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<SupportedToken>("USDC");
  const [order, setOrder] = useState<OnrampOrder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const walletAddress = user ? getWalletAddressFromPrivyUser(user) : null;
  const selectedNetwork = useMemo(() => getNetworkById(chainId), [chainId]);
  const parsedAmount = Number(amount);
  const canCreateOrder =
    authenticated &&
    !!walletAddress &&
    !!selectedNetwork &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const handleCreateOrder = async () => {
    if (!authenticated) {
      login();
      return;
    }

    if (!walletAddress) {
      connectWallet();
      return;
    }

    if (!selectedNetwork || !canCreateOrder) {
      toast({
        title: "Invalid Deposit Details",
        description: "Enter a valid amount and ensure a supported network is selected.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/onramp/payment-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          token,
          chainId: selectedNetwork.id,
          walletAddress,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to create deposit order");
      }

      setOrder(result.order);
      toast({
        title: "Deposit Created",
        description: "Transfer the exact amount to the account details below.",
      });
    } catch (error: any) {
      toast({
        title: "Deposit Error",
        description: error?.message || "Unable to create deposit order",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!order?.id) return;
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/onramp/payment-orders/${encodeURIComponent(order.id)}`);
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to refresh order status");
      }

      setOrder(result.order);
      toast({
        title: "Status Updated",
        description: `Current order status: ${String(result.order?.status || "pending")}`,
      });
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error?.message || "Unable to refresh deposit status",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="w-full rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-4">
      <div className="text-left">
        <p className="text-xs uppercase tracking-wide text-gray-500">Deposit</p>
        <h2 className="text-xl font-semibold text-gray-900">Fiat to Crypto</h2>
        <p className="text-sm text-gray-600 mt-1">
          Deposit NGN and receive {token} in your connected wallet.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500">Amount (NGN)</label>
        <Input
          type="number"
          min="1"
          placeholder="e.g. 10000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-12 rounded-2xl bg-gray-50 border-gray-300"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500">Receive Token</label>
        <Select
          value={token}
          onValueChange={(value) => setToken(value as SupportedToken)}
        >
          <SelectTrigger className="h-12 rounded-2xl bg-gray-50 border-gray-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USDC">USDC</SelectItem>
            <SelectItem value="USDT">USDT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
        <p>
          <span className="font-medium">Recipient:</span>{" "}
          {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Not connected"}
        </p>
        <p>
          <span className="font-medium">Network:</span> {selectedNetwork?.name || "Unsupported"}
        </p>
      </div>

      <Button
        onClick={handleCreateOrder}
        disabled={isCreating || (!authenticated ? false : !walletAddress ? false : !canCreateOrder)}
        className="w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white"
      >
        {!authenticated
          ? "Sign in to Deposit"
          : !walletAddress
            ? "Connect Wallet to Deposit"
            : isCreating
              ? "Creating Deposit..."
              : "Create Deposit Instructions"}
      </Button>

      {order && (
        <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Order ID:</span> {order.id}
            </p>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 uppercase">
              {order.status}
            </span>
          </div>

          {order.providerAccount ? (
            <div className="text-sm text-gray-700 space-y-1">
              <p><span className="font-medium">Bank:</span> {order.providerAccount.institution}</p>
              <p><span className="font-medium">Account Name:</span> {order.providerAccount.accountName}</p>
              <p><span className="font-medium">Account Number:</span> {order.providerAccount.accountIdentifier}</p>
              <p className="text-xs text-gray-500 mt-2">
                Transfer exactly {Number.isFinite(parsedAmount) ? parsedAmount.toLocaleString() : amount} NGN.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Payment account details are not yet available. Refresh status shortly.
            </p>
          )}

          <Button
            variant="outline"
            onClick={handleRefreshStatus}
            disabled={isRefreshing}
            className="w-full h-11 rounded-xl"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Deposit Status"}
          </Button>
        </div>
      )}
    </div>
  );
}

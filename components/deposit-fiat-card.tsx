"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { chainIdToPaycrestNetwork } from "@/lib/utils";
import {
  MIN_DEPOSIT_RECEIVE_STABLE,
  type DepositRateData,
  type OnrampOrder,
  type SupportedToken,
} from "@/types";
import { DepositFormSkeleton } from "@/components/ui/loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isTerminalOnrampOrderStatus } from "@/lib/onramp-order";
import { Check, Copy, Loader } from "lucide-react";

/** Poll interval for GET `/v2/sender/orders/:id` (noblocks uses 5s; product asked for 3s here). */
const DEPOSIT_ORDER_POLL_MS = 3000;
/** Fallback funding window when API does not return `validUntil`. */
const DEPOSIT_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

function initialDepositExpiryMs(order: OnrampOrder): number {
  if (order.validUntil) {
    const t = new Date(order.validUntil).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return Date.now() + DEPOSIT_PAYMENT_WINDOW_MS;
}

export function DepositFiatCard() {
  const { ready, authenticated, user, login, connectWallet } = usePrivy();
  const { toast } = useToast();
  const { chainId } = useSelectedNetwork();

  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<SupportedToken | "">("");
  const [order, setOrder] = useState<OnrampOrder | null>(null);
  const [orderExpiryMs, setOrderExpiryMs] = useState<number | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [rateData, setRateData] = useState<DepositRateData | null>(null);
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [copiedDepositField, setCopiedDepositField] = useState<"account" | "amount" | null>(
    null
  );
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const walletAddress = user ? getWalletAddressFromPrivyUser(user) : null;
  const selectedNetwork = useMemo(() => getNetworkById(chainId), [chainId]);
  const paycrestNetwork = useMemo(() => chainIdToPaycrestNetwork(chainId), [chainId]);
  const parsedAmount = Number(amount);
  const hasAmountInput = amount.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const estimatedReceive =
    hasAmountInput && !!token && rateData?.rate
      ? parsedAmount / rateData.rate
      : null;
  const meetsMinimumReceive =
    estimatedReceive != null && estimatedReceive + 1e-12 >= MIN_DEPOSIT_RECEIVE_STABLE;
  const canCreateOrder =
    authenticated &&
    !!walletAddress &&
    !!selectedNetwork &&
    !!token &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    meetsMinimumReceive;

  /** Plain digits for bank apps (no thousand separators). */
  const ngnAmountPlain = useMemo(() => {
    if (Number.isFinite(parsedAmount)) return String(Math.round(parsedAmount));
    const digits = amount.replace(/\D/g, "");
    return digits || "";
  }, [parsedAmount, amount]);

  const copyToClipboard = useCallback(
    async (
      text: string,
      description: string,
      depositFeedback?: "account" | "amount"
    ) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied", description });
        if (depositFeedback) {
          if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
          }
          setCopiedDepositField(depositFeedback);
          copyFeedbackTimeoutRef.current = setTimeout(() => {
            setCopiedDepositField(null);
            copyFeedbackTimeoutRef.current = null;
          }, 2000);
        }
      } catch {
        toast({
          title: "Copy failed",
          description: "Could not access the clipboard.",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!order) {
      setCopiedDepositField(null);
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = null;
      }
    }
  }, [order]);

  const loadRate = useCallback(async () => {
    if (!token) {
      setRateData(null);
      setRateError(null);
      return;
    }
    setIsRateLoading(true);
    setRateError(null);
    try {
      const params = new URLSearchParams({
        token,
        amount: "1",
        currency: "NGN",
        network: paycrestNetwork,
        side: "buy",
      });

      const response = await fetch(`/api/rate?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok || !json?.success || typeof json?.data?.rate !== "number") {
        throw new Error(json?.error || "Unable to fetch deposit rate");
      }

      setRateData({
        token: String(json.data.token || token),
        network: String(json.data.network || paycrestNetwork),
        rate: Number(json.data.rate),
      });
    } catch (error: any) {
      setRateData(null);
      setRateError(error?.message || "Rate unavailable");
    } finally {
      setIsRateLoading(false);
    }
  }, [token, paycrestNetwork]);

  useEffect(() => {
    void loadRate();
    const interval = setInterval(() => {
      void loadRate();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadRate]);

  useEffect(() => {
    if (!order?.validUntil) return;
    const t = new Date(order.validUntil).getTime();
    if (Number.isNaN(t)) return;
    setOrderExpiryMs((prev) => {
      if (prev === null) return t;
      return Math.min(prev, t);
    });
  }, [order?.validUntil]);

  useEffect(() => {
    if (!order?.id || orderExpiryMs === null) return;
    const id = window.setInterval(() => setCountdownTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [order?.id, orderExpiryMs]);

  useEffect(() => {
    if (!order?.id) return;
    const orderId = order.id;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/onramp/payment-orders/${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok || !json?.success || !json.order) return;

        const next = json.order as OnrampOrder;
        const st = String(next.status ?? "");
        if (isTerminalOnrampOrderStatus(st)) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          const low = st.toLowerCase();
          if (low === "settled") {
            toast({
              title: "Deposit complete",
              description: "Your bank transfer has been confirmed.",
            });
            setOrder(null);
            setOrderExpiryMs(null);
            return;
          }
          if (low === "expired") {
            toast({
              title: "Order expired",
              description: "This deposit window has closed without a matching payment.",
              variant: "destructive",
            });
          } else if (low === "refunded") {
            toast({
              title: "Order refunded",
              description: "Funds were returned according to provider rules.",
            });
          }
        }
        setOrder(next);
      } catch {
        /* ignore transient poll errors */
      }
    };

    void poll();
    pollIntervalRef.current = setInterval(() => void poll(), DEPOSIT_ORDER_POLL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    // toast is stable from useToast in practice; omit to avoid restarting the poll loop unnecessarily
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-bind when order id changes
  }, [order?.id]);

  const remainingMs = useMemo(() => {
    if (orderExpiryMs === null) return 0;
    void countdownTick;
    return Math.max(0, orderExpiryMs - Date.now());
  }, [orderExpiryMs, countdownTick]);
  const countdownM = Math.floor(remainingMs / 60000);
  const countdownS = Math.floor((remainingMs % 60000) / 1000);
  const countdownLabel = `${countdownM}:${String(countdownS).padStart(2, "0")}`;

  const handleCreateOrder = async () => {
    if (!authenticated) {
      login();
      return;
    }

    if (!walletAddress) {
      connectWallet();
      return;
    }

    if (!selectedNetwork || !token || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Invalid Deposit Details",
        description: "Enter a valid amount, select a token, and ensure a supported network is selected.",
        variant: "destructive",
      });
      return;
    }

    if (!meetsMinimumReceive && rateData?.rate) {
      const minNgn = MIN_DEPOSIT_RECEIVE_STABLE * rateData.rate;
      toast({
        title: "Amount too low",
        description: `You must receive at least ${MIN_DEPOSIT_RECEIVE_STABLE} ${token}. Try at least ₦${Math.ceil(minNgn).toLocaleString()} NGN at the current rate.`,
        variant: "destructive",
      });
      return;
    }

    if (!canCreateOrder) {
      toast({
        title: "Cannot create deposit",
        description: "Check your amount, token, and wallet connection.",
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
          token: token as SupportedToken,
          chainId: selectedNetwork.id,
          walletAddress,
          ...(user?.id ? { privyUserId: user.id } : {}),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to create deposit order");
      }

      const created = result.order as OnrampOrder;
      setOrder(created);
      setOrderExpiryMs(initialDepositExpiryMs(created));
      toast({
        title: "Deposit Created",
        description: "Transfer the exact amount using the bank details in the dialog.",
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

  if (!ready) {
    return <DepositFormSkeleton />;
  }

  return (
    <div className="w-full rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-4">
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
        <label className="text-xs text-gray-500">Receive</label>
        <div className="h-12 rounded-2xl bg-gray-50 border border-gray-300 px-3 flex items-center justify-between gap-3">
          <div
            className={`min-w-0 flex items-center text-base font-semibold tabular-nums ${
              hasAmountInput ? "text-gray-900" : "text-gray-400"
            }`}
          >
            {!hasAmountInput ? (
              "0"
            ) : isRateLoading && estimatedReceive == null ? (
              <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
                <Loader className="h-5 w-5 shrink-0 animate-spin text-gray-500" aria-hidden />
                <span className="sr-only">Loading exchange rate</span>
              </span>
            ) : estimatedReceive != null ? (
              estimatedReceive.toFixed(6)
            ) : (
              "0"
            )}
          </div>
          <Select
            value={token}
            onValueChange={(value) => setToken(value as SupportedToken)}
          >
            <SelectTrigger className="h-8 w-[150px] rounded-xl border-gray-900 bg-gray-900 text-white hover:bg-gray-800">
              <SelectValue placeholder="Select Token" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USDC">USDC</SelectItem>
              <SelectItem value="USDT">USDT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasAmountInput && (
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">
              {rateError
                ? rateError
                : rateData?.rate && token
                  ? `1 ${token} ≈ ₦${rateData.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${paycrestNetwork})`
                  : ""}
            </p>
            {token &&
              rateData?.rate &&
              estimatedReceive != null &&
              !meetsMinimumReceive && (
                <p className="text-[11px] text-amber-800">
                  Minimum receive is {MIN_DEPOSIT_RECEIVE_STABLE} {token}. Enter at least ₦
                  {Math.ceil(MIN_DEPOSIT_RECEIVE_STABLE * rateData.rate).toLocaleString()} NGN at this rate.
                </p>
              )}
          </div>
        )}
      </div>

      {walletAddress && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
          <p>
            <span className="font-medium">Recipient:</span>{" "}
            {`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
          </p>
          <p>
            <span className="font-medium">Network:</span> {selectedNetwork?.name || "Unsupported"}
          </p>
        </div>
      )}

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
              : "Create Deposit"}
      </Button>

      <Dialog
        open={!!order}
        onOpenChange={(open) => {
          if (!open) {
            setOrder(null);
            setOrderExpiryMs(null);
          }
        }}
      >
        {order ? (
          <DialogContent className="max-w-md gap-4 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-left">Complete your bank transfer</DialogTitle>
              <DialogDescription className="text-left text-gray-500">
                Send the exact NGN amount to the account below. We keep checking your payment status
                automatically until it completes or the window ends.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Status
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold uppercase">
                {order.status}
              </span>
            </div>

            {order.providerAccount ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 space-y-2">
                <p>
                  <span className="font-medium text-gray-700">Bank:</span>{" "}
                  {order.providerAccount.institution}
                </p>
                <p>
                  <span className="font-medium text-gray-700">Account Name:</span>{" "}
                  {order.providerAccount.accountName}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0">
                    <span className="font-medium text-gray-700">Account Number:</span>{" "}
                    <span className="font-mono break-all">
                      {order.providerAccount.accountIdentifier}
                    </span>
                  </p>
                  <button
                    type="button"
                    aria-label={
                      copiedDepositField === "account"
                        ? "Account number copied"
                        : "Copy account number"
                    }
                    onClick={() =>
                      void copyToClipboard(
                        order.providerAccount!.accountIdentifier,
                        "Account number copied to clipboard.",
                        "account"
                      )
                    }
                    className="shrink-0 border-0 bg-transparent p-0"
                  >
                    {copiedDepositField === "account" ? (
                      <Check className="h-4 w-4 text-green-600" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 text-xs text-gray-500">
                  <p className="min-w-0 pr-2">
                    Transfer exactly{" "}
                    {Number.isFinite(parsedAmount) ? parsedAmount.toLocaleString() : amount} NGN.
                  </p>
                  <button
                    type="button"
                    aria-label={
                      copiedDepositField === "amount"
                        ? "Amount copied"
                        : "Copy transfer amount"
                    }
                    disabled={!ngnAmountPlain}
                    onClick={() =>
                      void copyToClipboard(
                        ngnAmountPlain,
                        "Amount copied to clipboard.",
                        "amount"
                      )
                    }
                    className="shrink-0 border-0 bg-transparent p-0 disabled:opacity-40"
                  >
                    {copiedDepositField === "amount" ? (
                      <Check className="h-4 w-4 text-green-600" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Payment account details are not yet available — we will keep checking every few
                seconds.
              </p>
            )}
            {orderExpiryMs !== null && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {remainingMs <= 0 ? (
                  <span>
                    Payment window ended — still checking with the network for the final status.
                  </span>
                ) : (
                  <span>
                    Time remaining:{" "}
                    <span className="font-semibold tabular-nums">{countdownLabel}</span>
                    <span className="text-amber-800/90"> (funding deadline)</span>
                  </span>
                )}
              </div>
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

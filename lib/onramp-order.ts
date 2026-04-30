import type { Prisma } from "@prisma/client";
import type { OnrampOrder } from "@/types";

/** Stable unique `Transaction.paybetaReference` for PayCrest sender on-ramp orders. */
export function paybetaReferenceForOnrampOrderId(orderId: string): string {
  return `ONRAMP:${orderId}`;
}

function normalizeEvmTxHash(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^0x[a-fA-F0-9]{64}$/i.test(t)) return t.toLowerCase();
  if (/^[a-fA-F0-9]{64}$/i.test(t)) return `0x${t.toLowerCase()}`;
  if (/^0x[0-9a-f]+$/i.test(t) && t.length >= 10) return t.toLowerCase();
  return null;
}

/** Pull settlement / transfer tx hash from PayCrest v2 sender order `data` (see SenderOrderResponse.txHash). */
export function extractPaymentTxHashFromSenderOrderData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;

  const direct = normalizeEvmTxHash(data.txHash);
  if (direct) return direct;

  const txs = data.transactions;
  if (Array.isArray(txs)) {
    for (let i = txs.length - 1; i >= 0; i--) {
      const item = txs[i];
      if (item && typeof item === "object") {
        const h = normalizeEvmTxHash((item as Record<string, unknown>).txHash);
        if (h) return h;
      }
    }
  }

  const logs = data.transactionLogs;
  if (Array.isArray(logs)) {
    for (let i = logs.length - 1; i >= 0; i--) {
      const item = logs[i];
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const h = normalizeEvmTxHash(row.txHash ?? row.hash);
        if (h) return h;
      }
    }
  }

  return null;
}

/** Map PayCrest v2 sender order lifecycle to our `Transaction` status fields. */
export function paycrestOrderStatusToTransactionUpdate(
  status: string
): Prisma.TransactionUpdateInput {
  const s = String(status || "").toLowerCase();
  if (s === "settled") {
    return {
      status: "completed",
      completedAt: new Date(),
      errorMessage: null,
    };
  }
  if (s === "expired") {
    return { status: "failed", errorMessage: "Deposit window expired" };
  }
  if (s === "refunded") {
    return { status: "refunded", errorMessage: null };
  }
  if (s === "failed") {
    return { status: "failed", errorMessage: "Deposit failed" };
  }
  return { status: "processing" };
}

/**
 * Normalizes PayCrest v2 sender order payloads (create + GET by id).
 * `validUntil` may live on `providerAccount` (see noblocks `resolveOnrampOrderStatusFromV2Response`).
 */
export function parseOnrampOrderFromPayload(payload: unknown): OnrampOrder {
  const root = payload as Record<string, unknown> | null | undefined;
  const data = (root?.data ?? root) as Record<string, unknown> | null | undefined;
  const providerAccountRaw =
    (data?.providerAccount ?? data?.paymentAccount) as Record<string, unknown> | null | undefined;

  const validUntilRaw =
    (providerAccountRaw && typeof providerAccountRaw.validUntil === "string"
      ? providerAccountRaw.validUntil
      : null) ??
    (typeof data?.validUntil === "string" ? data.validUntil : null);

  const providerAccount = providerAccountRaw
    ? {
      institution: String(
        providerAccountRaw.institution ??
        providerAccountRaw.bankName ??
        providerAccountRaw.bank_name ??
        ""
      ),
      accountName: String(
        providerAccountRaw.accountName ?? providerAccountRaw.account_name ?? ""
      ),
      accountIdentifier: String(
        providerAccountRaw.accountIdentifier ??
        providerAccountRaw.accountNumber ??
        providerAccountRaw.account_identifier ??
        ""
      ),
    }
    : null;

  const paymentTxHash = extractPaymentTxHashFromSenderOrderData(data ?? undefined);

  return {
    id: String(data?.id ?? data?.orderId ?? root?.id ?? ""),
    status: String(data?.status ?? root?.status ?? "pending"),
    validUntil: validUntilRaw ? String(validUntilRaw) : null,
    providerAccount,
    paymentTxHash,
  };
}

/** Stop polling when order reaches a terminal lifecycle state (aligned with noblocks on-ramp flow). */
export function isTerminalOnrampOrderStatus(status: string): boolean {
  const s = String(status || "").toLowerCase();
  return s === "settled" || s === "expired" || s === "refunded";
}

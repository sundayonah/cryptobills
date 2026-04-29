import type { OnrampOrder } from "@/types";

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

  return {
    id: String(data?.id ?? data?.orderId ?? root?.id ?? ""),
    status: String(data?.status ?? root?.status ?? "pending"),
    validUntil: validUntilRaw ? String(validUntilRaw) : null,
    providerAccount,
  };
}

/** Stop polling when order reaches a terminal lifecycle state (aligned with noblocks on-ramp flow). */
export function isTerminalOnrampOrderStatus(status: string): boolean {
  const s = String(status || "").toLowerCase();
  return s === "settled" || s === "expired" || s === "refunded";
}

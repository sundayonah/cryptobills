/**
 * Map PayBeta query / webhook fields to Cryptobilz DB transaction status.
 * PayBeta may return code "00" with paymentStatus "Reversed" — treat as terminal failure
 * so escrow refund runs (same as explicit API failure).
 */

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/_/g, ' ');
}

/**
 * PayBeta returns `code` as string "02" in JSON docs; webhooks may send numeric `2`.
 * Normalize so `2`, `"2"`, and `"02"` all match failure handling.
 */
export function normalizePaybetaCode(code: string | number | null | undefined): string {
  if (code == null || code === '') return '';
  const s = String(code).trim();
  if (/^\d+$/.test(s)) return s.padStart(2, '0');
  return s;
}

/** paymentStatus values that mean the bill succeeded (normalized full string) */
const DELIVERED_EXACT = ['delivered', 'success', 'successful', 'completed'] as const;

/**
 * Terminal failure / reversal — user should not stay in "processing"
 * (on-chain refund via settleUtilityEscrowOnBillFailure when applicable).
 */
const TERMINAL_FAILURE_PAYMENT = [
  'failed',
  'failure',
  'reversed',
  'reverse',
  'refunded',
  'refund',
  'cancelled',
  'canceled',
  'declined',
  'rejected',
  'void',
  'voided',
] as const;

const PENDING_PAYMENT = [
  'pending',
  'processing',
  'in progress',
  'inprogress',
  'queued',
  'submitted',
] as const;

export interface MapPaybetaStatusInput {
  code: string | number | null | undefined;
  /** Top-level `status` from PayBeta (e.g. webhook body) */
  responseStatus?: string | null;
  /** data.paymentStatus */
  paymentStatus?: string | null;
  message?: string | null;
  currentDbStatus: string;
}

export interface MapPaybetaStatusResult {
  status: string;
  errorMessage: string | null;
}

function paymentIndicatesFailure(ps: string): boolean {
  if (!ps) return false;
  const exact = TERMINAL_FAILURE_PAYMENT as readonly string[];
  if (exact.includes(ps)) return true;
  return TERMINAL_FAILURE_PAYMENT.some((term) => ps.includes(term));
}

function paymentIndicatesDelivered(ps: string): boolean {
  if (!ps) return false;
  const exact = DELIVERED_EXACT as readonly string[];
  if (exact.includes(ps)) return true;
  if (/\b(delivered|successful|completed)\b/.test(ps)) {
    if (/\bunsuccessful\b|\bundelivered\b|\bincomplete\b/.test(ps)) return false;
    return true;
  }
  return false;
}

function paymentIndicatesPending(ps: string): boolean {
  if (!ps) return false;
  const exact = PENDING_PAYMENT as readonly string[];
  return exact.includes(ps) || ps.includes('pending') || ps.includes('processing');
}

/**
 * PayBeta codes: '00' success envelope, '01' pending, '02' failed, '99' not found
 */
export function mapPaybetaTransactionToDbStatus(input: MapPaybetaStatusInput): MapPaybetaStatusResult {
  const { code, responseStatus, paymentStatus, message, currentDbStatus } = input;
  const c = normalizePaybetaCode(code);
  const rs = norm(responseStatus);
  const ps = norm(paymentStatus);

  if (c === '99') {
    return {
      status: 'failed',
      errorMessage: message || 'Transaction not found or invalid reference',
    };
  }
  if (c === '02') {
    return {
      status: 'failed',
      errorMessage: message || 'Transaction failed',
    };
  }
  if (c === '01') {
    return {
      status: 'processing',
      errorMessage: message || 'Transaction is pending',
    };
  }

  if (c === '00') {
    if (rs === 'failed') {
      return {
        status: 'failed',
        errorMessage: message || 'Transaction failed',
      };
    }

    if (paymentIndicatesFailure(ps)) {
      return {
        status: 'failed',
        errorMessage:
          message || (paymentStatus?.trim() ? `PayBeta: ${paymentStatus.trim()}` : 'Bill reversed or failed'),
      };
    }

    if (paymentIndicatesDelivered(ps)) {
      return { status: 'completed', errorMessage: null };
    }

    if (!ps || paymentIndicatesPending(ps)) {
      return {
        status: 'processing',
        errorMessage: message || (ps ? null : 'Transaction is pending'),
      };
    }

    // Unknown paymentStatus under 00 — keep processing (avoid false refunds)
    return {
      status: 'processing',
      errorMessage: message || null,
    };
  }

  return {
    status: currentDbStatus,
    errorMessage: message || 'Unknown transaction status',
  };
}

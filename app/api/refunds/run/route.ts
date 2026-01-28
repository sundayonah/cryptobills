import { NextRequest, NextResponse } from "next/server";
import { processPendingRefunds } from "@/lib/refunds";

/**
 * Refund Runner
 *
 * POST /api/refunds/run
 *
 * This endpoint processes a batch of `refund_pending` transactions and
 * attempts to send token refunds back to the original user wallets.
 *
 * It is intended to be invoked from a secure environment only
 * (e.g. Vercel Cron with a secret header).
 */
export async function POST(request: NextRequest) {
  // Optional: simple shared-secret auth to prevent public abuse
  const secret = process.env.REFUND_JOB_SECRET;
  if (secret) {
    const provided = request.headers.get("x-refund-job-secret");
    if (!provided || provided !== secret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    const results = await processPendingRefunds(10);

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error("[refunds/run] Failed to process refunds:", error);

    return NextResponse.json(
      {
        error: "Failed to process refunds",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}


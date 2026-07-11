import { NextRequest, NextResponse } from "next/server";
import config from "@/lib/config";
import { prisma } from "@/lib/prisma";
import {
  parseOnrampOrderFromPayload,
  paybetaReferenceForOnrampOrderId,
  paycrestOrderStatusToTransactionUpdate,
} from "@/lib/onramp-order";

function ensureOnrampConfig() {
  const missing = [
    ["PAYCREST_ONRAMP_API_URL", config.paycrest_onramp_api_url],
    ["PAYCREST_SENDER_API_KEY", config.paycrest_sender_api_key],
  ].filter(([, value]) => !value || !String(value).trim());

  if (missing.length > 0) {
    throw new Error(`Missing required onramp config: ${missing.map(([name]) => name).join(", ")}`);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!config.deposit_enabled) {
    return NextResponse.json({ success: false, error: 'Deposit is disabled' }, { status: 404 });
  }

  try {
    ensureOnrampConfig();

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Order id is required" },
        { status: 400 }
      );
    }

    const baseUrl = config.paycrest_onramp_api_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v2/sender/orders/${encodeURIComponent(id)}`, {
      headers: {
        "API-Key": config.paycrest_sender_api_key,
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.message || "Failed to fetch onramp payment order",
          details: payload,
        },
        { status: response.status || 500 }
      );
    }

    const order = parseOnrampOrderFromPayload(payload);

    if (order.id) {
      try {
        const payRef = paybetaReferenceForOnrampOrderId(order.id);
        const row = await prisma.transaction.findFirst({
          where: { paybetaReference: payRef, category: "onramp" },
        });
        if (row) {
          const statusData = paycrestOrderStatusToTransactionUpdate(order.status);
          await prisma.transaction.update({
            where: { id: row.id },
            data: {
              ...statusData,
              ...(order.paymentTxHash ? { paymentTxHash: order.paymentTxHash } : {}),
            },
          });
        }
      } catch (syncErr) {
        console.error("Onramp transaction history sync failed:", syncErr);
      }
    }

    return NextResponse.json({
      success: true,
      order,
      message: payload?.message || "Onramp order fetched successfully",
    });
  } catch (error: any) {
    console.error("Onramp order fetch error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

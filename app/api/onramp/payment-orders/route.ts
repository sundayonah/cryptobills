import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import config from "@/lib/config";

const createOnrampOrderSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero"),
  token: z.enum(["USDC", "USDT"]),
  chainId: z.number(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
});

const AGGREGATOR_NETWORK_BY_CHAIN_ID: Record<number, string> = {
  8453: "base",
  137: "polygon",
  42161: "arbitrum",
};

function ensureOnrampConfig() {
  const missing = [
    ["PAYCREST_ONRAMP_API_URL", config.paycrest_onramp_api_url],
    ["PAYCREST_SENDER_API_KEY", config.paycrest_sender_api_key],
    ["PAYCREST_REFUND_INSTITUTION", config.paycrest_refund_institution],
    ["PAYCREST_REFUND_ACCOUNT_NUMBER", config.paycrest_refund_account_number],
    ["PAYCREST_REFUND_ACCOUNT_NAME", config.paycrest_refund_account_name],
  ].filter(([, value]) => !value || !String(value).trim());

  if (missing.length > 0) {
    throw new Error(`Missing required onramp config: ${missing.map(([name]) => name).join(", ")}`);
  }
}

function parseOnrampResponse(payload: any) {
  const data = payload?.data ?? payload;
  const providerAccount = data?.providerAccount ?? data?.paymentAccount ?? null;

  return {
    id: String(data?.id ?? data?.orderId ?? ""),
    status: String(data?.status ?? payload?.status ?? "pending"),
    providerAccount: providerAccount
      ? {
          institution: String(
            providerAccount?.institution ??
              providerAccount?.bankName ??
              providerAccount?.bank_name ??
              ""
          ),
          accountName: String(
            providerAccount?.accountName ??
              providerAccount?.account_name ??
              ""
          ),
          accountIdentifier: String(
            providerAccount?.accountIdentifier ??
              providerAccount?.accountNumber ??
              providerAccount?.account_identifier ??
              ""
          ),
        }
      : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    ensureOnrampConfig();

    const body = await request.json();
    const validated = createOnrampOrderSchema.parse(body);
    const network = AGGREGATOR_NETWORK_BY_CHAIN_ID[validated.chainId];

    if (!network) {
      return NextResponse.json(
        { success: false, error: "Unsupported network for onramp" },
        { status: 400 }
      );
    }

    const createOrderBody = {
      amount: String(validated.amount),
      amountIn: "fiat",
      source: {
        type: "fiat",
        currency: "NGN",
        refundAccount: {
          institution: config.paycrest_refund_institution,
          accountIdentifier: config.paycrest_refund_account_number,
          accountName: config.paycrest_refund_account_name,
        },
      },
      destination: {
        type: "crypto",
        currency: validated.token,
        network,
        recipient: {
          address: validated.walletAddress.toLowerCase(),
          network,
        },
      },
    };

    const baseUrl = config.paycrest_onramp_api_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v2/sender/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Key": config.paycrest_sender_api_key,
      },
      body: JSON.stringify(createOrderBody),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.message || "Failed to create onramp payment order",
          details: payload,
        },
        { status: response.status || 500 }
      );
    }

    const order = parseOnrampResponse(payload);
    return NextResponse.json({
      success: true,
      order,
      message: payload?.message || "Onramp order created successfully",
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Onramp order create error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

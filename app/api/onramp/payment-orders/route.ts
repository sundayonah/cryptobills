import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import config from "@/lib/config";
import { fetchPaycrestRateV2, normalizeWalletAddress } from "@/lib/utils";
import { getNetworkById } from "@/lib/networks";
import { prisma } from "@/lib/prisma";
import { parseOnrampOrderFromPayload, paybetaReferenceForOnrampOrderId } from "@/lib/onramp-order";
import { MIN_DEPOSIT_RECEIVE_STABLE } from "@/types";

const createOnrampOrderSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero"),
  token: z.enum(["USDC", "USDT"]),
  chainId: z.number(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
  privyUserId: z.string().optional(),
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

    let buyRate: number;
    try {
      buyRate = await fetchPaycrestRateV2({
        token: validated.token,
        amount: 1,
        currency: "NGN",
        network,
        side: "buy",
      });
    } catch {
      return NextResponse.json(
        { success: false, error: "Unable to verify minimum deposit against current buy rate" },
        { status: 503 }
      );
    }

    const estimatedReceive = validated.amount / buyRate;
    if (estimatedReceive + 1e-12 < MIN_DEPOSIT_RECEIVE_STABLE) {
      const minNgn = MIN_DEPOSIT_RECEIVE_STABLE * buyRate;
      return NextResponse.json(
        {
          success: false,
          error: `Minimum receive is ${MIN_DEPOSIT_RECEIVE_STABLE} ${validated.token}. Increase NGN amount (at least ₦${Math.ceil(minNgn).toLocaleString()} at current rate).`,
        },
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

    const order = parseOnrampOrderFromPayload(payload);
    const networkMeta = getNetworkById(validated.chainId);

    if (order.id) {
      const normalizedWalletAddress = normalizeWalletAddress(validated.walletAddress);
      if (normalizedWalletAddress) {
        try {
          let user = await prisma.user.findUnique({
            where: { walletAddress: normalizedWalletAddress },
          });

          if (!user && validated.privyUserId) {
            user = await prisma.user.findUnique({
              where: { privyUserId: validated.privyUserId },
            });
            if (user && user.walletAddress !== normalizedWalletAddress) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { walletAddress: normalizedWalletAddress },
              });
            }
          }

          if (!user) {
            if (validated.privyUserId) {
              const existingByPrivy = await prisma.user.findUnique({
                where: { privyUserId: validated.privyUserId },
              });
              if (existingByPrivy) {
                user = await prisma.user.update({
                  where: { id: existingByPrivy.id },
                  data: { walletAddress: normalizedWalletAddress },
                });
              } else {
                user = await prisma.user.create({
                  data: {
                    walletAddress: normalizedWalletAddress,
                    privyUserId: validated.privyUserId,
                  },
                });
              }
            } else {
              user = await prisma.user.create({
                data: { walletAddress: normalizedWalletAddress },
              });
            }
          } else if (validated.privyUserId && !user.privyUserId) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { privyUserId: validated.privyUserId },
            });
          }

          const payRef = paybetaReferenceForOnrampOrderId(order.id);
          const tokenAmountStr = estimatedReceive.toFixed(8);
          const serviceAmountNgn = Math.round(validated.amount);

          await prisma.transaction.create({
            data: {
              userId: user.id,
              walletAddress: normalizedWalletAddress,
              token: validated.token,
              tokenAmount: tokenAmountStr,
              ngnAmount: validated.amount,
              exchangeRate: buyRate,
              networkChainId: networkMeta?.id ?? validated.chainId,
              networkName: networkMeta?.name ?? null,
              category: "onramp",
              service: "deposit",
              serviceName: `Fiat deposit → ${validated.token}`,
              accountNumber: normalizedWalletAddress,
              serviceAmount: serviceAmountNgn,
              paybetaReference: payRef,
              status: "processing",
              ...(order.paymentTxHash ? { paymentTxHash: order.paymentTxHash } : {}),
            },
          });
        } catch (persistErr) {
          console.error("Failed to persist onramp transaction for history:", persistErr);
        }
      }
    }

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

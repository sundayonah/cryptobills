import { NextRequest, NextResponse } from "next/server";
import { fetchPaycrestRateV2 } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token")?.trim().toUpperCase();
    const rawAmount = searchParams.get("amount");
    const amount = rawAmount == null || rawAmount === "" ? 1 : Number(rawAmount);
    const currency = searchParams.get("currency")?.trim() || "NGN";
    const network = searchParams.get("network")?.trim();
    const providerId = searchParams.get("providerId")?.trim() || undefined;
    const rawSide = searchParams.get("side")?.trim().toLowerCase();
    const side = rawSide === "sell" ? "sell" : "buy";

    if (!token || !network || !currency || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "token, currency, network are required; amount must be positive",
        },
        { status: 400 },
      );
    }

    if (token !== "USDC" && token !== "USDT") {
      return NextResponse.json(
        { success: false, error: "token must be USDC or USDT" },
        { status: 400 },
      );
    }

    const rate = await fetchPaycrestRateV2({
      token,
      amount,
      currency,
      network,
      side,
      providerId,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          token,
          amount,
          currency: currency.toUpperCase(),
          network: network.toLowerCase(),
          side,
          rate,
          fetchedAt: new Date().toISOString(),
        },
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Rate fetching failed" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}

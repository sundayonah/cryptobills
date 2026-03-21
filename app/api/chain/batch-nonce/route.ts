import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { resolveBatchNonceForAccount } from "@/lib/batch-nonce-resolve";
import { getServerBatchNonceRpcCandidates } from "@/lib/wallet-payment";

const ALLOWED_CHAIN_IDS = new Set([137, 42161, 8453]);

/**
 * POST /api/chain/batch-nonce
 * Body: { chainId: number, accountAddress: `0x${string}` }
 * Returns: { nonce: string } (decimal string for JSON)
 *
 * Server-side RPC reads avoid browser CORS / 401 on public Polygon endpoints.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const chainId = Number(body?.chainId);
    const raw = body?.accountAddress;

    if (!Number.isInteger(chainId) || !ALLOWED_CHAIN_IDS.has(chainId)) {
      return NextResponse.json(
        { error: "chainId must be 137, 42161, or 8453" },
        { status: 400 }
      );
    }

    if (typeof raw !== "string" || !isAddress(raw)) {
      return NextResponse.json({ error: "accountAddress must be a valid 0x address" }, { status: 400 });
    }

    const accountAddress = getAddress(raw) as `0x${string}`;
    const rpcUrls = getServerBatchNonceRpcCandidates(chainId);
    if (rpcUrls.length === 0) {
      return NextResponse.json({ error: "No RPC configured for this chain" }, { status: 500 });
    }

    const nonce = await resolveBatchNonceForAccount(chainId, accountAddress, rpcUrls);
    return NextResponse.json({ nonce: nonce.toString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to resolve batch nonce";
    console.error("[batch-nonce]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

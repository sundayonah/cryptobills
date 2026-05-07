/**
 * Utility bill escrow: users pay NEXT_PUBLIC_PAYMENT_ESCROW_ADDRESS first (held until settlement);
 * on PayBeta success funds forward to NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS (treasury);
 * on failure funds refund to the user's wallet (same tokenAmount / chain).
 * Legacy: NEXT_PUBLIC_PAYMENT_RECEIVE_ADDRESS is still read if ESCROW is unset.
 */

import type { Transaction } from "@prisma/client";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  erc20Abi,
  http,
  parseAbiItem,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import config from "@/lib/config";
import { prisma } from "@/lib/prisma";
import type { SupportedToken } from "@/lib/token-utils";
import { getTokenConfigForChain } from "@/lib/token-utils";
import { getViemChain } from "@/lib/utils";
import { PUBLIC_RPC_BY_CHAIN } from "@/lib/wallet-payment";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function normalizeAddr(a: string): string {
  return a.trim().toLowerCase();
}

/** Treasury / main payout wallet */
export function getTreasuryAddress(): string {
  return config.payment_recipient_address.trim();
}

/** Where users send payment first (held until bill settles). Falls back to treasury when unset. */
export function getPaymentEscrowAddress(): string {
  const escrow = config.payment_escrow_address.trim();
  const t = getTreasuryAddress();
  return escrow || t;
}

/** Escrow auto forward/refund when escrow wallet differs from treasury. */
export function isUtilityEscrowSettlementEnabled(): boolean {
  const treasury = normalizeAddr(getTreasuryAddress());
  const escrow = normalizeAddr(getPaymentEscrowAddress());
  return Boolean(treasury && escrow && treasury !== escrow);
}

export function isEscrowSettlementCategory(category: string): boolean {
  return category !== "onramp" && category !== "transfer";
}

function requireSponsorKey(): `0x${string}` {
  const raw = config.sponsor_evm_wallet_private_key.trim();
  if (!raw) {
    throw new Error("SPONSOR_EVM_WALLET_PRIVATE_KEY is not configured");
  }
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  return key as `0x${string}`;
}

function getHttpRpc(chainId: number): string {
  const u = PUBLIC_RPC_BY_CHAIN[chainId];
  if (!u) throw new Error(`No RPC configured for chain ${chainId}`);
  return u;
}

/**
 * Confirms payment tx sends at least `tokenAmount` of `token` to the escrow address, from payer wallet.
 */
export async function verifyUtilityInboundPayment(params: {
  paymentTxHash: string;
  networkChainId: number | null | undefined;
  token: SupportedToken;
  tokenAmount: string;
  payerWalletAddress: string;
}): Promise<void> {
  if (!isUtilityEscrowSettlementEnabled()) return;

  const chainId = params.networkChainId;
  if (!chainId) {
    throw new Error("networkChainId is required when payment escrow is enabled");
  }

  const tokenCfg = getTokenConfigForChain(params.token, chainId);
  if (!tokenCfg) {
    throw new Error(`Token ${params.token} not supported on chain ${chainId}`);
  }

  const escrowAddr = normalizeAddr(getPaymentEscrowAddress());
  const payer = normalizeAddr(params.payerWalletAddress);
  const minWei = parseUnits(params.tokenAmount, tokenCfg.decimals);

  const chain = getViemChain(chainId);
  const publicClient = createPublicClient({
    ...(chain ? { chain } : {}),
    transport: http(getHttpRpc(chainId), { timeout: 30_000 }),
  });

  const receipt = await publicClient.getTransactionReceipt({
    hash: params.paymentTxHash as Hash,
  });

  if (receipt.status !== "success") {
    throw new Error("Payment transaction failed on-chain");
  }

  let receivedWei = BigInt(0);
  for (const log of receipt.logs) {
    if (normalizeAddr(log.address) !== normalizeAddr(tokenCfg.address)) continue;
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as { from: Address; to: Address; value: bigint };
      if (normalizeAddr(args.to) !== escrowAddr) continue;
      if (normalizeAddr(args.from) !== payer) continue;
      receivedWei += args.value;
    } catch {
      // not a Transfer — skip
    }
  }

  // Tiny wei tolerance for rounding
  if (receivedWei + BigInt(50) < minWei) {
    throw new Error(
      `Inbound payment verification failed: expected at least ${params.tokenAmount} ${params.token} to escrow wallet`,
    );
  }
}

async function sendTokenFromSponsorWallet(params: {
  chainId: number;
  token: SupportedToken;
  to: Address;
  amountDecimal: string;
}): Promise<Hash> {
  const tokenCfg = getTokenConfigForChain(params.token, params.chainId);
  if (!tokenCfg) {
    throw new Error(`Token ${params.token} not supported on chain ${params.chainId}`);
  }

  const chain = getViemChain(params.chainId);
  if (!chain) {
    throw new Error(`Unsupported chain for settlement: ${params.chainId}`);
  }

  const rpc = getHttpRpc(params.chainId);
  const account = privateKeyToAccount(requireSponsorKey());

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpc, { timeout: 60_000 }),
  });

  const amountWei = parseUnits(params.amountDecimal, tokenCfg.decimals);

  const hash = await walletClient.writeContract({
    address: tokenCfg.address as Address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [params.to, amountWei],
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 60_000 }),
  });

  await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120_000,
  });

  return hash;
}

/** Forward escrowed tokens to treasury after successful bill settlement. Idempotent. */
export async function forwardUtilityFundsToTreasury(
  transaction: Transaction,
): Promise<{ txHash?: string; skippedReason?: string }> {
  if (!isUtilityEscrowSettlementEnabled()) {
    return { skippedReason: "escrow_disabled" };
  }
  if (!isEscrowSettlementCategory(transaction.category)) {
    return { skippedReason: "category" };
  }
  if (transaction.treasuryForwardTxHash) {
    return { txHash: transaction.treasuryForwardTxHash };
  }

  const chainId = transaction.networkChainId;
  if (!chainId) {
    return { skippedReason: "missing_chain" };
  }

  const treasury = getTreasuryAddress() as Address;
  const token = transaction.token as SupportedToken;
  if (token !== "USDC" && token !== "USDT") {
    return { skippedReason: "unsupported_token" };
  }

  try {
    const hash = await sendTokenFromSponsorWallet({
      chainId,
      token,
      to: treasury,
      amountDecimal: transaction.tokenAmount,
    });
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { treasuryForwardTxHash: hash },
    });
    return { txHash: hash };
  } catch (e: any) {
    console.error("[utility-escrow] forwardToTreasury failed:", e?.message || e);
    return { skippedReason: e?.message || "forward_failed" };
  }
}

/** Refund tokens from escrow wallet to user after PayBeta failure. Idempotent. */
export async function refundUtilityFundsToUser(
  transaction: Transaction,
): Promise<{ txHash?: string; skippedReason?: string; error?: string }> {
  if (!isUtilityEscrowSettlementEnabled()) {
    return { skippedReason: "escrow_disabled" };
  }
  if (!isEscrowSettlementCategory(transaction.category)) {
    return { skippedReason: "category" };
  }
  if (transaction.refundTxHash) {
    return { txHash: transaction.refundTxHash };
  }

  const chainId = transaction.networkChainId;
  if (!chainId) {
    return { skippedReason: "missing_chain", error: "missing_chain" };
  }

  const token = transaction.token as SupportedToken;
  if (token !== "USDC" && token !== "USDT") {
    return { skippedReason: "unsupported_token", error: "unsupported_token" };
  }

  const userWallet = transaction.walletAddress.trim() as Address;

  try {
    const hash = await sendTokenFromSponsorWallet({
      chainId,
      token,
      to: userWallet,
      amountDecimal: transaction.tokenAmount,
    });

    const now = new Date();
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        refundTxHash: hash,
        refundStatus: "confirmed",
        refundCompletedAt: now,
        status: "refunded",
        errorMessage:
          transaction.errorMessage?.includes("Refunded on-chain")
            ? transaction.errorMessage
            : `${transaction.errorMessage || "PayBeta failed"}. Refunded on-chain.`,
      },
    });

    return { txHash: hash };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[utility-escrow] refundToUser failed:", msg);
    return { error: msg };
  }
}

/** After PayBeta confirms the bill — sweep escrow to treasury (best-effort). */
export async function settleUtilityEscrowOnBillSuccess(transactionId: string): Promise<void> {
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) return;
  const out = await forwardUtilityFundsToTreasury(tx);
  if (out.txHash) return;
  if (!isUtilityEscrowSettlementEnabled()) return;
  console.error(
    "[utility-escrow] Treasury forward failed after successful bill; manual sweep may be needed",
    transactionId,
    out.skippedReason,
  );
}

/**
 * After PayBeta fails — refund user from escrow wallet when enabled, else mark refund_pending.
 */
export async function settleUtilityEscrowOnBillFailure(
  transactionId: string,
  contextMessage: string,
): Promise<void> {
  const row = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!row) return;

  if (row.status === "completed" || row.treasuryForwardTxHash) {
    return;
  }

  const refundResult = await refundUtilityFundsToUser(row);

  if (refundResult.txHash) {
    return;
  }

  if (
    refundResult.skippedReason === "escrow_disabled" ||
    refundResult.skippedReason === "category"
  ) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "refund_pending",
        refundStatus: "pending",
        refundReason: contextMessage,
        refundRequestedAt: new Date(),
        errorMessage: contextMessage,
      },
    });
    return;
  }

  if (
    refundResult.skippedReason === "missing_chain" ||
    refundResult.skippedReason === "unsupported_token"
  ) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "refund_pending",
        refundStatus: "pending",
        refundReason: refundResult.skippedReason,
        refundRequestedAt: new Date(),
        errorMessage: contextMessage,
      },
    });
    return;
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: "refund_pending",
      refundStatus: "failed",
      refundReason: refundResult.error || "On-chain refund failed",
      refundRequestedAt: new Date(),
      errorMessage: `${contextMessage}. Refund tx failed: ${refundResult.error || "unknown"}`,
    },
  });
}

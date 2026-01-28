import { prisma } from "@/lib/prisma";
import { getTokenConfigForChain } from "@/lib/token-utils";
import type { SupportedToken } from "@/types";
import { PrivyClient } from "@privy-io/node";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

/**
 * Privy server client used to send refund transactions from the
 * Cryptobilz app wallet (gas-sponsored).
 *
 * NOTE: You must configure the following environment variables:
 * - PRIVY_APP_ID
 * - PRIVY_APP_SECRET
 * - PRIVY_APP_WALLET_ID  (the Privy wallet ID for the Cryptobilz app wallet)
 */
const privyClient =
  process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET
    ? new PrivyClient({
        appId: process.env.PRIVY_APP_ID,
        appSecret: process.env.PRIVY_APP_SECRET,
      })
    : null;

const APP_WALLET_ID = process.env.PRIVY_APP_WALLET_ID;

if (!APP_WALLET_ID) {
  console.warn(
    "[refunds] PRIVY_APP_WALLET_ID is not set. Automatic refunds will not be able to send transactions."
  );
}

/**
 * Attempt to issue a token refund for a single transaction.
 *
 * This:
 * - Builds an ERC-20 transfer from the Cryptobilz app wallet
 *   back to the original user wallet.
 * - Sends the transaction via Privy's gas-sponsored server SDK.
 * - Updates the Transaction row with refund status + tx hash.
 *
 * Returns the updated transaction record.
 */
export async function issueRefundForTransaction(
  transactionId: string
) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!tx) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  if (tx.status !== "refund_pending") {
    // Nothing to do – only process explicit refund_pending transactions
    return tx;
  }

  if (!privyClient || !APP_WALLET_ID) {
    throw new Error(
      "Privy client or app wallet ID not configured. Cannot send refund transaction."
    );
  }

  if (!tx.networkChainId) {
    throw new Error(
      `Transaction ${transactionId} is missing networkChainId. Cannot construct refund transaction.`
    );
  }

  const tokenSymbol = tx.token as SupportedToken;
  const tokenConfig = getTokenConfigForChain(
    tokenSymbol,
    tx.networkChainId
  );

  if (!tokenConfig) {
    throw new Error(
      `Unsupported token/network combination for refund: ${tokenSymbol} on chain ${tx.networkChainId}`
    );
  }

  // Parse token amount using the known decimals
  const amount = parseUnits(
    tx.tokenAmount,
    tokenConfig.decimals
  );

  const erc20TransferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [tx.walletAddress as `0x${string}`, amount],
  });

  // Mark refund as pending before sending the transaction
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      refundStatus: "pending",
      refundRequestedAt: tx.refundRequestedAt ?? new Date(),
    },
  });

  // Send the transaction via Privy Node SDK.
  // See: https://docs.privy.io/basics/nodeJS/quickstart
  const result: any = await (privyClient as any).wallets?.eth_sendTransaction?.({
    walletId: APP_WALLET_ID,
    chainId: tx.networkChainId,
    tx: {
      to: tokenConfig.address,
      data: erc20TransferData,
      value: "0x0",
    },
  });

  const refundTxHash: string | undefined =
    result?.txHash || result?.hash || result?.transactionHash;

  const updated = await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      refundTxHash: refundTxHash ?? tx.refundTxHash,
      refundStatus: "confirmed",
      refundCompletedAt: new Date(),
      status: "refunded",
    },
  });

  return updated;
}

/**
 * Process a batch of refund_pending transactions.
 * Intended to be called from a scheduled job / cron.
 */
export async function processPendingRefunds(limit: number = 10) {
  const pending = await prisma.transaction.findMany({
    where: {
      status: "refund_pending",
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: {
    id: string;
    success: boolean;
    error?: string;
  }[] = [];

  for (const tx of pending) {
    try {
      await issueRefundForTransaction(tx.id);
      results.push({ id: tx.id, success: true });
    } catch (error: any) {
      console.error("[refunds] Failed to refund transaction", tx.id, error);

      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          refundStatus: "failed",
          refundReason:
            tx.refundReason ??
            (error?.message || "Refund transaction failed"),
        },
      });

      results.push({
        id: tx.id,
        success: false,
        error: error?.message || "Unknown refund error",
      });
    }
  }

  return results;
}


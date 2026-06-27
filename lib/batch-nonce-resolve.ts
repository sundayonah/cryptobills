/**
 * Server-safe batch nonce resolution (eth_getCode + nonce()).
 * Used by POST /api/chain/batch-nonce — browsers must not call most public RPCs directly (CORS/401).
 */
import { createPublicClient, http, type Address } from "viem";
import { getViemChain } from "@/lib/utils";
import { readBatchNonce } from "@/lib/providerBatch";

const EIP7702_DELEGATION_PREFIX = "0xef0100";

function isPlainEoaBytecode(code: string | undefined): boolean {
  return !code || code === "0x" || code === "0x0";
}

function hasEip7702Delegation(code: string | undefined): boolean {
  if (!code || isPlainEoaBytecode(code)) return false;
  return code.toLowerCase().includes(EIP7702_DELEGATION_PREFIX);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRpcError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Plain JSON-RPC eth_getCode (same as a working curl). Used when viem transport fails on some setups.
 */
async function getCodeViaJsonRpc(rpcUrl: string, address: Address): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [address, "latest"],
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  if (typeof json.result !== "string") {
    throw new Error("Invalid eth_getCode response");
  }
  return json.result;
}

/**
 * Resolve ProviderBatchCallAndSponsor batch nonce for signing.
 */
export async function resolveBatchNonceForAccount(
  chainId: number,
  accountAddress: Address,
  rpcUrls: string[]
): Promise<bigint> {
  const chain = getViemChain(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const urls = Array.from(
    new Set(rpcUrls.filter((u) => typeof u === "string" && u.trim().length > 0).map((u) => u.trim()))
  );
  if (urls.length === 0) {
    throw new Error("No RPC URLs configured for batch nonce");
  }

  const getCodeErrors: string[] = [];
  let code: string | undefined;
  for (const rpcUrl of urls) {
    try {
      const client = createPublicClient({
        chain,
        transport: http(rpcUrl, { timeout: 20_000 }),
      });
      code = await client.getCode({ address: accountAddress });
      break;
    } catch (e) {
      getCodeErrors.push(`${rpcUrl}: ${formatRpcError(e)}`);
    }
  }

  if (code === undefined) {
    for (const rpcUrl of urls) {
      try {
        code = await getCodeViaJsonRpc(rpcUrl, accountAddress);
        break;
      } catch (e) {
        getCodeErrors.push(`json-rpc ${rpcUrl}: ${formatRpcError(e)}`);
      }
    }
  }

  if (code === undefined) {
    throw new Error(
      `Could not read account code on ${chain.name}. ` + getCodeErrors.slice(-4).join(" | ")
    );
  }

  if (isPlainEoaBytecode(code) || !hasEip7702Delegation(code)) {
    return BigInt(0);
  }

  let lastReadError: unknown;
  for (const rpcUrl of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const client = createPublicClient({
          chain,
          transport: http(rpcUrl, { timeout: 20_000 }),
        });
        return await readBatchNonce(client, accountAddress);
      } catch (e) {
        lastReadError = e;
        await delay(300 * (attempt + 1));
      }
    }
  }

  throw new Error(
    `Could not read batch nonce on ${chain.name} after trying ${urls.length} RPC(s).` +
      (lastReadError instanceof Error ? ` Last error: ${lastReadError.message}` : "")
  );
}

/**
 * EIP-7702 client helpers: parse delegated implementation from EOA bytecode.
 * Used when checking if EOA is already delegated (e.g. to skip sending auth).
 */
import type { Address, PublicClient } from "viem";
import { createPublicClient, http } from "viem";
import type { Chain } from "viem";

export const EIP7702_MAGIC_PREFIX = "0xef0100";

/**
 * Parse the authorized implementation address from EOA bytecode (eth_getCode).
 * Under EIP-7702, authorized EOAs expose bytecode starting with 0xef0100 + 20-byte address.
 */
export function parseEip7702AuthorizedAddress(
  code: string | null | undefined
): Address | null {
  if (!code || code === "0x" || code === "0x0") return null;
  const normalized = code.toLowerCase();
  const idx = normalized.indexOf(EIP7702_MAGIC_PREFIX);
  if (idx === -1) return null;
  return `0x${normalized.slice(idx + EIP7702_MAGIC_PREFIX.length, idx + EIP7702_MAGIC_PREFIX.length + 40)}` as Address;
}

/**
 * Detect whether an EOA is delegated via EIP-7702 and return the implementation address.
 */
export async function get7702ImplementationAddress(
  publicClient: PublicClient,
  address: Address
): Promise<Address | null> {
  const code = await publicClient.getCode({ address });
  return parseEip7702AuthorizedAddress(code ?? undefined);
}

/**
 * Get the EIP-7702 authorized implementation address for an EOA on a given chain.
 * Use when you don't have a PublicClient (creates one from chain + rpcUrl).
 */
export async function get7702AuthorizedImplementationForAddress(
  chain: Chain,
  rpcUrl: string,
  address: Address
): Promise<Address | null> {
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  return get7702ImplementationAddress(publicClient, address);
}

/**
 * Bundler / execute-sponsored config.
 * Base (8453) uses Privy sendTransaction(sponsor: true) only; no execute-sponsored.
 * Polygon, Arbitrum use execute-sponsored for Privy embedded wallet. Avalanche when delegation contract is deployed.
 */

/** Chain IDs that use the execute-sponsored API (batch + optional EIP-7702). Base is excluded. */
export const EXECUTE_SPONSORED_CHAIN_IDS: number[] = [137, 42161]; // 43114 add when Avalanche delegation contract is deployed

/** Base chain: Privy sponsor only, no execute-sponsored. */
export const BASE_CHAIN_ID = 8453;

/** EIP-7702 delegation contract (ProviderBatchCallAndSponsor) per chain. */
export const DELEGATION_CONTRACT_BY_CHAIN: Record<number, string> = {
  42220: "0x847dfdAa218F9137229CF8424378871A1DA8f625",
  8453: "0xDb61aF57A7fD133C54F51ae4d95469af9F846F6e",
  42161: "0x59288AC5c262B71b631Be6742967261526E00d59",
  56: "0x59288AC5c262B71b631Be6742967261526E00d59",
  137: "0x97b4e402db6DB09F067B6E085B84c95176499d16",
  1135: "0x0a7aA9F8eab1665DD905288669447b66082E4B17",
  1: "0x25054a2b9D4544ed292DC1a74E8bF1f6F449d988",
};

export function getDelegationContractAddress(chainId: number): string {
  return DELEGATION_CONTRACT_BY_CHAIN[chainId] ?? "";
}

export function isExecuteSponsoredChain(chainId: number): boolean {
  return EXECUTE_SPONSORED_CHAIN_IDS.includes(chainId);
}

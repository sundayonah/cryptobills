/**
 * Bundler chain config and client creation (server-only).
 * Sponsor key from config (SPONSOR_EVM_WALLET_PRIVATE_KEY or PRIVATE_KEY).
 * RPC URLs come from lib/networks.ts (getNetworkById); no separate RPC env required.
 */
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, polygon, type Chain } from 'viem/chains';
import { getNetworkById } from '@/lib/networks';
import config from '@/lib/config';

/** Execute-sponsored only (Base uses Privy native sponsor, not this bundler). */
const SUPPORTED_CHAINS: Record<number, { chain: Chain; envKey: string }> = {
  [polygon.id]: { chain: polygon, envKey: 'POLYGON' },
  [arbitrum.id]: { chain: arbitrum, envKey: 'ARB' },
};

export function parseChainId(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    throw new Error('Missing or empty chainId');
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error('chainId must be a finite positive integer');
  }
  if (!SUPPORTED_CHAINS[n]) {
    throw new Error(
      `Unsupported chainId: ${n}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`
    );
  }
  return n;
}

/**
 * Returns the RPC URL for the given chain from lib/networks.ts (getNetworkById).
 * Falls back to RPC_URL_<chainId> env only if the network has no rpcUrl.
 */
export function parseRpcUrl(chainId: number): string {
  const entry = SUPPORTED_CHAINS[chainId];
  if (!entry) {
    throw new Error(`Unsupported chainId: ${chainId}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
  }
  const network = getNetworkById(chainId);
  if (network?.rpcUrl?.trim()) {
    return network.rpcUrl.trim();
  }
  const envKey = `RPC_URL_${chainId}`;
  const url = (process.env[envKey] ?? '').trim();
  if (!url) {
    throw new Error(`No RPC for chain ${chainId}: add rpcUrl in lib/networks.ts or set ${envKey}`);
  }
  return url;
}

function getSponsorPrivateKey(): `0x${string}` {
  const key = config.sponsor_evm_wallet_private_key;
  if (!key) {
    throw new Error('SPONSOR_EVM_WALLET_PRIVATE_KEY or PRIVATE_KEY is required for bundler operations');
  }
  if (!key.startsWith('0x')) {
    throw new Error('SPONSOR_EVM_WALLET_PRIVATE_KEY must start with 0x');
  }
  const hexPart = key.slice(2);
  if (hexPart.length !== 64) {
    throw new Error(`SPONSOR_EVM_WALLET_PRIVATE_KEY must be 0x + 64 hex characters (got ${hexPart.length})`);
  }
  if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
    throw new Error('SPONSOR_EVM_WALLET_PRIVATE_KEY must contain only 0-9 and a-f after 0x');
  }
  return key as `0x${string}`;
}

let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function getSponsorAccount() {
  if (!cachedAccount) {
    cachedAccount = privateKeyToAccount(getSponsorPrivateKey());
  }
  return cachedAccount;
}

export function getClients(
  chainId: number,
  rpcUrl: string,
  includeWallet: boolean = true
): { publicClient: PublicClient; walletClient: WalletClient | undefined; chain: Chain } {
  const entry = SUPPORTED_CHAINS[chainId];
  if (!entry) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  const { chain } = entry;
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  let walletClient: WalletClient | undefined;
  if (includeWallet) {
    const account = getSponsorAccount();
    walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  }
  return { publicClient, walletClient, chain };
}

export { SUPPORTED_CHAINS };

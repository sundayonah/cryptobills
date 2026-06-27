/**
 * Professional Wallet Payment Handler
 * Utility functions for wallet operations and transaction confirmation
 * 
 * Uses Viem + Privy pattern
 * Compatible with Privy v1.50 (useWallets hook)
 */

import { encodeFunctionData, erc20Abi, type Address, createPublicClient, http, type Hash } from 'viem';
import { SUPPORTED_NETWORKS } from './networks';
import config from './config';
import { getViemChain } from './utils';

function buildPublicRpcByChain(): Record<number, string> {
  const alchemy = config.alchemy_api_key?.trim();
  return {
    8453: alchemy ? `https://base-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://mainnet.base.org',
    137: alchemy ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://rpc.ankr.com/polygon',
    42161: alchemy ? `https://arb-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://arb1.arbitrum.io/rpc',
  };
}

export const PUBLIC_RPC_BY_CHAIN: Record<number, string> = buildPublicRpcByChain();

export function getPublicRpcUrl(chainId: number): string | null {
  return PUBLIC_RPC_BY_CHAIN[chainId] ?? null;
}

/**
 * Browser-side fallbacks for tx receipt polling only.
 * Must allow CORS from the app origin — many public RPCs block browsers (401/CORS).
 */
const BROWSER_RECEIPT_FALLBACK_RPC_BY_CHAIN: Record<number, string[]> = {
  137: [
    'https://polygon-bor.publicnode.com',
    'https://rpc.ankr.com/polygon',
  ],
  42161: [
    'https://arbitrum-one.publicnode.com',
    'https://arb1.arbitrum.io/rpc',
  ],
};

/** Ordered unique RPC candidates for browser waitForTransactionReceipt fallbacks. */
export function getBatchNonceRpcCandidates(chainId: number): string[] {
  const primary = getPublicRpcUrl(chainId);
  const fallbacks = BROWSER_RECEIPT_FALLBACK_RPC_BY_CHAIN[chainId] ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [primary, ...fallbacks]) {
    if (!u || !u.trim()) continue;
    const key = u.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.trim());
  }
  return out;
}

/**
 * Server-only RPC list for POST /api/chain/batch-nonce (no CORS — can use Ankr, etc.).
 */
const SERVER_BATCH_NONCE_FALLBACK_RPC: Record<number, string[]> = {
  137: [
    'https://polygon-bor.publicnode.com',
    'https://rpc.ankr.com/polygon',
    'https://polygon.drpc.org',
  ],
  42161: [
    'https://arbitrum-one.publicnode.com',
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum.drpc.org',
  ],
  8453: ['https://base.llamarpc.com', 'https://mainnet.base.org'],
};

function dedupeRpcUrls(urls: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || !String(raw).trim()) continue;
    const u = String(raw).trim();
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export function getServerBatchNonceRpcCandidates(chainId: number): string[] {
  const envUrl = typeof process !== 'undefined' ? process.env[`RPC_URL_${chainId}`]?.trim() : '';
  const primary = getPublicRpcUrl(chainId);
  const fallbacks = SERVER_BATCH_NONCE_FALLBACK_RPC[chainId] ?? [];
  // Same pattern as Polygon/Arbitrum: env override, then primary, then fallbacks
  return dedupeRpcUrls([envUrl, primary, ...fallbacks]);
}

// ============================================
// TYPES
// ============================================

/**
 * Privy wallet interface (from useWallets hook)
 */
export interface PrivyWallet {
    address: string;
    chainId: string | number;
    connectorType?: string;
    walletClientType?: string;
    getEthereumProvider: () => Promise<any>; // Returns EIP-1193 provider
    switchChain?: (chainId: number) => Promise<void>;
}

/**
 * Ethereum provider (EIP-1193 compatible)
 */
export interface EthereumProvider {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    on?: (event: string, handler: (...args: any[]) => void) => void;
    removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

// ============================================
// BALANCE CHECKING
// ============================================

/**
 * Check wallet token balance using Viem
 * Returns balance in human-readable format
 */
export async function checkTokenBalance(
    provider: EthereumProvider,
    tokenAddress: Address,
    walletAddress: Address,
    decimals: number
): Promise<string> {
    try {
        // Use EIP-1193 provider to read balance
        const balanceHex = await provider.request({
            method: 'eth_call',
            params: [
                {
                    to: tokenAddress,
                    data: encodeFunctionData({
                        abi: erc20Abi,
                        functionName: 'balanceOf',
                        args: [walletAddress],
                    }),
                },
                'latest',
            ],
        });

        // Parse balance from hex string
        const balanceBigInt = BigInt(balanceHex);
        const balance = Number(balanceBigInt) / 10 ** decimals;
        return balance.toFixed(decimals).replace(/\.?0+$/, ''); // Remove trailing zeros
    } catch (error: any) {
        throw new Error(`Failed to check token balance: ${error.message}`);
    }
}

type ConfirmedReceipt = { status: 'success' | 'failed'; blockNumber: bigint };

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryGetReceiptFromRpc(
    txHash: Hash,
    chainId: number,
    rpcUrl: string
): Promise<ConfirmedReceipt | null> {
    const chain = getViemChain(chainId);
    if (!chain) return null;
    try {
        const client = createPublicClient({
            chain,
            transport: http(rpcUrl, { timeout: 22_000 }),
        });
        const receipt = await client.getTransactionReceipt({ hash: txHash });
        return {
            status: receipt.status === 'success' ? 'success' : 'failed',
            blockNumber: receipt.blockNumber,
        };
    } catch {
        return null;
    }
}

/**
 * After primary wait times out, poll multiple RPCs (Polygon is often slow or flaky in browser).
 * Without a receipt the app never calls purchase APIs - user pays on-chain but gets no service.
 */
async function pollReceiptAcrossRpcs(
    txHash: Hash,
    chainId: number,
    totalMs: number,
    intervalMs: number
): Promise<ConfirmedReceipt | null> {
    const urls = getBatchNonceRpcCandidates(chainId);
    if (urls.length === 0) return null;
    const deadline = Date.now() + totalMs;
    let round = 0;
    while (Date.now() < deadline) {
        const url = urls[round % urls.length];
        round++;
        const r = await tryGetReceiptFromRpc(txHash, chainId, url);
        if (r) return r;
        await sleep(intervalMs);
    }
    return null;
}

/**
 * Wait for transaction confirmation using Viem public client.
 *
 * @param maxAttempts - With delayMs, sets minimum wait budget when chain-specific floor applies
 */
export async function waitForTransactionConfirmation(
    txHash: Hash,
    chainId: number,
    maxAttempts: number = 20,
    delayMs: number = 3000
): Promise<ConfirmedReceipt> {
    const network = SUPPORTED_NETWORKS.find((n) => n.id === chainId);
    if (!network) {
        throw new Error(`Network configuration not found for chain ID ${chainId}`);
    }
    const rpcUrl = PUBLIC_RPC_BY_CHAIN[chainId] ?? network.rpcUrl;
    if (!rpcUrl) {
        throw new Error(`No RPC configured for chain ID ${chainId}`);
    }

    const chain = getViemChain(chainId);
    const publicClient = createPublicClient({
        ...(chain ? { chain } : {}),
        transport: http(rpcUrl, { timeout: 25_000 }),
    });

    const baseTimeout = maxAttempts * delayMs;
    const waitTimeoutMs =
        chainId === 137 ? Math.max(baseTimeout, 200_000)
        : chainId === 42161 ? Math.max(baseTimeout, 120_000)
        : baseTimeout;

    const extraPollMs =
        chainId === 137 ? 180_000
        : chainId === 42161 ? 90_000
        : 60_000;
    const pollIntervalMs = chainId === 137 ? 4_000 : 3_500;

    try {
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: waitTimeoutMs,
            confirmations: 1,
        });

        return {
            status: receipt.status === 'success' ? 'success' : 'failed',
            blockNumber: receipt.blockNumber,
        };
    } catch {
        const urls = getBatchNonceRpcCandidates(chainId);
        for (const url of urls) {
            const r = await tryGetReceiptFromRpc(txHash, chainId, url);
            if (r) return r;
        }

        try {
            const tx = await publicClient.getTransaction({ hash: txHash });
            if (tx?.blockNumber) {
                const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
                return {
                    status: receipt.status === 'success' ? 'success' : 'failed',
                    blockNumber: receipt.blockNumber,
                };
            }
        } catch {
            // ignore
        }

        const polled = await pollReceiptAcrossRpcs(txHash, chainId, extraPollMs, pollIntervalMs);
        if (polled) return polled;

        throw new Error(
            `Transaction confirmation timed out after extended wait (${Math.round((waitTimeoutMs + extraPollMs) / 1000)}s). ` +
            `Check the block explorer if the chain succeeded, then contact support with tx: ${txHash}`
        );
    }
}

// ============================================
// EXTERNAL WALLET PAYMENT FUNCTIONS
// ============================================

/**
 * Send ERC-20 token transfer using external wallet (MetaMask, Trust Wallet, etc.)
 * User pays gas fees themselves
 */
export async function sendExternalWalletTransaction(
    provider: EthereumProvider,
    tokenAddress: Address,
    recipientAddress: Address,
    amount: bigint,
    fromAddress: Address
): Promise<Hash> {
    try {
        // Prepare ERC-20 transfer data
        const transferData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [recipientAddress, amount],
        });

        // Send transaction via external wallet
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [
                {
                    from: fromAddress,
                    to: tokenAddress,
                    data: transferData,
                    value: '0x0', // ERC-20 transfers don't send ETH
                },
            ],
        });

        return txHash as Hash;
    } catch (error: any) {
        throw new Error(`External wallet transaction failed: ${error.message || error}`);
    }
}

/**
 * Switch network on external wallet if needed
 */
export async function switchNetworkIfNeeded(
    provider: EthereumProvider,
    targetChainId: number
): Promise<void> {
    try {
        // Get current chain ID
        const currentChainId = await provider.request({ method: 'eth_chainId' });
        const currentChainIdDecimal = parseInt(currentChainId, 16);

        if (currentChainIdDecimal !== targetChainId) {
            // Request network switch
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }],
            });
        }
    } catch (error: any) {
        // If network doesn't exist in wallet, we could add it here
        // For now, just throw the error
        throw new Error(`Failed to switch network: ${error.message || error}`);
    }
}

/**
 * Get external wallet provider from Privy wallet object
 */
export async function getExternalWalletProvider(wallet: PrivyWallet): Promise<EthereumProvider> {
    if (wallet.connectorType === 'embedded') {
        throw new Error('Cannot use embedded wallet as external wallet');
    }

    const provider = await wallet.getEthereumProvider();
    if (!provider) {
        throw new Error('Failed to get provider from external wallet');
    }

    return provider;
}

/**
 * Estimate gas for external wallet transaction
 */
export async function estimateExternalWalletGas(
    provider: EthereumProvider,
    tokenAddress: Address,
    recipientAddress: Address,
    amount: bigint,
    fromAddress: Address
): Promise<bigint> {
    try {
        const transferData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [recipientAddress, amount],
        });

        const gasEstimate = await provider.request({
            method: 'eth_estimateGas',
            params: [
                {
                    from: fromAddress,
                    to: tokenAddress,
                    data: transferData,
                    value: '0x0',
                },
            ],
        });

        return BigInt(gasEstimate);
    } catch (error: any) {
        throw new Error(`Gas estimation failed: ${error.message || error}`);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get chain ID from Privy wallet (sync; may lag after switchChain).
 */
export function getWalletChainId(wallet: PrivyWallet): number {
    if (typeof wallet.chainId === 'string') {
        // Handle EIP-155 format: "eip155:8453"
        const parts = wallet.chainId.split(':');
        return parseInt(parts[parts.length - 1]);
    }
    return wallet.chainId;
}

/**
 * Get current chain ID from the wallet's provider (reliable after switchChain).
 */
export async function getWalletChainIdFromProvider(wallet: PrivyWallet): Promise<number> {
    const provider = await wallet.getEthereumProvider();
    const hex = await provider.request({ method: 'eth_chainId' });
    return typeof hex === 'string' ? parseInt(hex, 16) : Number(hex);
}

const SWITCH_CHAIN_POLL_MS = 400;
const SWITCH_CHAIN_TIMEOUT_MS = 6000;

/**
 * After calling wallet.switchChain(chainId), wait until the provider reports the target chain.
 */
export async function waitForWalletChain(
    wallet: PrivyWallet,
    chainId: number,
    options?: { pollMs?: number; timeoutMs?: number }
): Promise<void> {
    const pollMs = options?.pollMs ?? SWITCH_CHAIN_POLL_MS;
    const timeoutMs = options?.timeoutMs ?? SWITCH_CHAIN_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const current = await getWalletChainIdFromProvider(wallet);
        if (current === chainId) return;
        await new Promise((r) => setTimeout(r, pollMs));
    }
    const current = await getWalletChainIdFromProvider(wallet);
    throw new Error(`Network switch incomplete. Expected chain ${chainId}, but wallet is on chain ${current}`);
}

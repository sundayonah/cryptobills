/**
 * Professional Wallet Payment Handler
 * Utility functions for wallet operations and transaction confirmation
 * 
 * Uses Viem + Privy pattern (inspired by Noblocks/Paycrest)
 * Compatible with Privy v1.50 (useWallets hook)
 */

import { encodeFunctionData, erc20Abi, type Address, createPublicClient, http, type Hash } from 'viem';
import { SUPPORTED_NETWORKS } from './networks';
import config from './config';

function buildPublicRpcByChain(): Record<number, string> {
  const alchemy = config.alchemy_api_key?.trim();
  return {
    8453: alchemy ? `https://base-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://mainnet.base.org',
    137: alchemy ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://rpc.ankr.com/polygon',
    42161: alchemy ? `https://arb-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://arb1.arbitrum.io/rpc',
    // 43114: alchemy ? `https://avax-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://api.avax.network/ext/bc/C/rpc', // add when Avalanche delegation contract deployed
  };
}

export const PUBLIC_RPC_BY_CHAIN: Record<number, string> = buildPublicRpcByChain();

export function getPublicRpcUrl(chainId: number): string | null {
  return PUBLIC_RPC_BY_CHAIN[chainId] ?? null;
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

/**
 * Wait for transaction confirmation using Viem public client
 * 
 * @param txHash - Transaction hash
 * @param chainId - Network chain ID
 * @param maxAttempts - Maximum number of attempts (default: 20)
 * @param delayMs - Delay between attempts in milliseconds (default: 3000)
 * @returns Transaction receipt with status
 */
export async function waitForTransactionConfirmation(
    txHash: Hash,
    chainId: number,
    maxAttempts: number = 20,
    delayMs: number = 3000
): Promise<{ status: 'success' | 'failed'; blockNumber: bigint }> {
    // Prefer public RPC for confirmation to avoid 401 (Alchemy etc. may restrict browser origins)
    const network = SUPPORTED_NETWORKS.find(n => n.id === chainId);
    if (!network) {
        throw new Error(`Network configuration not found for chain ID ${chainId}`);
    }
    const rpcUrl = PUBLIC_RPC_BY_CHAIN[chainId] ?? network.rpcUrl;
    if (!rpcUrl) {
        throw new Error(`No RPC configured for chain ID ${chainId}`);
    }

    const publicClient = createPublicClient({
        transport: http(rpcUrl),
    });

    // Wait for transaction receipt
    try {
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: maxAttempts * delayMs, // Total timeout
            confirmations: 1, // Wait for 1 confirmation
        });

        return {
            status: receipt.status === 'success' ? 'success' : 'failed',
            blockNumber: receipt.blockNumber,
        };
    } catch (error: any) {
        // If timeout or other error, check transaction status
        try {
            const tx = await publicClient.getTransaction({ hash: txHash });
            if (tx && tx.blockNumber) {
                // Transaction is in a block, try to get receipt
                const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
                return {
                    status: receipt.status === 'success' ? 'success' : 'failed',
                    blockNumber: receipt.blockNumber,
                };
            }
        } catch (checkError) {
            // Transaction might not be confirmed yet
        }

        throw new Error(
            `Transaction confirmation timeout after ${maxAttempts} attempts. ` +
            `Please check the transaction manually: ${txHash}`
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

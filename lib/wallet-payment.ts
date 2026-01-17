/**
 * Professional Wallet Payment Handler
 * Handles token transfers from user wallet to payment recipient address
 * 
 * Uses Viem + Privy pattern (inspired by Noblocks/Paycrest)
 * Compatible with Privy v1.50 (useWallets hook)
 */

import { encodeFunctionData, erc20Abi, parseUnits, type Address, createPublicClient, http, type Hash } from 'viem';
import { getTokenConfigForChain } from './token-utils';
import { SUPPORTED_NETWORKS } from './networks';
import config from './config';
import type { SupportedToken } from '@/types';

// ============================================
// TYPES
// ============================================

/**
 * Token transfer result
 */
export interface TokenTransferResult {
    transactionHash: string;
    from: string;
    to: string;
    amount: string; // Token amount in human-readable format (e.g., "1.0")
    token: SupportedToken;
    networkChainId: number;
    networkName: string;
    status: 'success' | 'failed';
}

/**
 * Token transfer parameters
 */
export interface TokenTransferParams {
    token: SupportedToken;
    tokenAmount: string; // Amount in token (e.g., "1.0")
    recipientAddress?: string; // Optional, defaults to PAYMENT_RECIPIENT_ADDRESS
    chainId: number; // Network chain ID
}

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
// VALIDATION
// ============================================

/**
 * Validate payment recipient address
 */
function validateRecipientAddress(address?: string): Address {
    const recipient = address || config.payment_recipient_address;

    if (!recipient) {
        throw new Error(
            'Payment recipient address is not configured. ' +
            'Please set NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS in environment variables.'
        );
    }

    // Basic address validation (42 characters, starts with 0x)
    if (!recipient.startsWith('0x') || recipient.length !== 42) {
        throw new Error(`Invalid payment recipient address: ${recipient}`);
    }

    return recipient as Address;
}

/**
 * Validate token amount
 */
function validateTokenAmount(amount: string): number {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
        throw new Error('Invalid token amount. Amount must be greater than 0.');
    }
    return num;
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

// ============================================
// WALLET TRANSFER
// ============================================

/**
 * Transfer tokens from user wallet to payment recipient address
 * 
 * Uses Viem for encoding and Privy wallet for signing
 * 
 * @param wallet - Privy wallet instance from useWallets hook
 * @param params - Transfer parameters
 * @returns Transfer result with transaction hash and details
 */
export async function transferTokens(
    wallet: PrivyWallet,
    params: TokenTransferParams
): Promise<TokenTransferResult> {
    const { token, tokenAmount, recipientAddress, chainId } = params;

    try {
        // Validate inputs
        const amount = validateTokenAmount(tokenAmount);
        const recipient = validateRecipientAddress(recipientAddress);

        // Get token configuration for the chain
        const tokenConfig = getTokenConfigForChain(token, chainId);
        if (!tokenConfig) {
            throw new Error(`Token ${token} is not supported on chain ${chainId}`);
        }

        const tokenAddress = tokenConfig.address as Address;
        const decimals = tokenConfig.decimals;

        // Get wallet address
        const fromAddress = wallet.address as Address;

        // Get Ethereum provider from Privy wallet (EIP-1193 compatible)
        const ethereumProvider = await wallet.getEthereumProvider();
        if (!ethereumProvider) {
            throw new Error('Failed to get Ethereum provider from wallet');
        }

        // Check balance before transfer
        const balance = await checkTokenBalance(
            ethereumProvider,
            tokenAddress,
            fromAddress,
            decimals
        );

        const balanceAmount = parseFloat(balance);
        if (balanceAmount < amount) {
            throw new Error(
                `Insufficient balance. You have ${balance} ${token}, but need ${tokenAmount} ${token}.`
            );
        }

        // Switch to correct chain if needed
        const walletChainId = typeof wallet.chainId === 'string'
            ? parseInt(wallet.chainId.split(':')[1] || wallet.chainId)
            : wallet.chainId;

        if (walletChainId !== chainId && wallet.switchChain) {
            try {
                await wallet.switchChain(chainId);
            } catch (error: any) {
                // If switch fails, continue - the user might already be on the correct chain
                console.warn(`Failed to switch chain to ${chainId}:`, error.message);
            }
        }

        // Encode ERC20 transfer function call using Viem
        const transferData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [recipient, parseUnits(tokenAmount, decimals)],
        });

        // Send transaction using EIP-1193 provider (works with Privy and all EIP-1193 wallets)
        const txHash = await ethereumProvider.request({
            method: 'eth_sendTransaction',
            params: [
                {
                    from: fromAddress,
                    to: tokenAddress,
                    data: transferData,
                    value: '0x0', // ERC20 transfers don't send ETH
                },
            ],
        });

        // Get network name for display
        const networkName = getNetworkName(chainId);

        // Wait for transaction confirmation
        // Note: In production, you might want to poll for confirmation
        // For now, we'll return the hash immediately and let the caller handle confirmation

        return {
            transactionHash: txHash as string,
            from: fromAddress,
            to: recipient,
            amount: tokenAmount,
            token,
            networkChainId: chainId,
            networkName,
            status: 'success',
        };
    } catch (error: any) {
        // Enhanced error handling
        if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
            throw new Error('Transaction rejected by user');
        }

        if (error.code === 'INSUFFICIENT_FUNDS') {
            throw new Error('Insufficient funds for gas fee');
        }

        if (error.message) {
            throw error;
        }

        throw new Error(`Token transfer failed: ${error.message || 'Unknown error'}`);
    }
}

/**
 * Get network name from chain ID
 */
function getNetworkName(chainId: number): string {
    const networkNames: Record<number, string> = {
        1: 'Ethereum',
        137: 'Polygon',
        42161: 'Arbitrum',
        8453: 'Base',
        84532: 'Base Sepolia',
        // 56: 'BSC', // temporarily commented out
    };
    return networkNames[chainId] || `Chain ${chainId}`;
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
    // Get network configuration
    const network = SUPPORTED_NETWORKS.find(n => n.id === chainId);
    if (!network || !network.rpcUrl) {
        throw new Error(`Network configuration not found for chain ID ${chainId}`);
    }

    // Create public client for the network
    const publicClient = createPublicClient({
        transport: http(network.rpcUrl),
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
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Complete wallet payment flow
 * Handles the entire flow from validation to transfer
 * 
 * @param wallet - Privy wallet instance from useWallets hook
 * @param params - Transfer parameters
 * @returns Transfer result
 */
export async function processWalletPayment(
    wallet: PrivyWallet,
    params: TokenTransferParams
): Promise<TokenTransferResult> {
    return await transferTokens(wallet, params);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get wallet address from Privy wallet
 */
export function getWalletAddress(wallet: PrivyWallet): Address {
    return wallet.address as Address;
}

/**
 * Get chain ID from Privy wallet
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
 * Check if wallet is on the correct chain
 */
export function isWalletOnChain(wallet: PrivyWallet, chainId: number): boolean {
    const walletChainId = getWalletChainId(wallet);
    return walletChainId === chainId;
}

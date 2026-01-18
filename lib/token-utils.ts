/**
 * Token utility functions for getting token addresses and configs by network
 */

// Token addresses by chain
const TOKEN_ADDRESSES: Record<
    number,
    { USDC: string; USDT: string }
> = {
    1: {
        // Ethereum Mainnet
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
    137: {
        // Polygon Mainnet
        USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
        USDT: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    },
    42161: {
        // Arbitrum Mainnet
        USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    },
    8453: {
        // Base Mainnet
        USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
    // BSC temporarily commented out due to Privy configuration requirements
    // 56: {
    //     // BSC (Binance Smart Chain) Mainnet
    //     USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    //     USDT: "0x55d398326f99059fF775485246999027B3197955",
    // },
};

// Token decimals (same for all chains)
const TOKEN_DECIMALS = {
    USDC: 6,
    USDT: 6,
} as const;

export type SupportedToken = 'USDC' | 'USDT';

/**
 * Get token address for a specific chain
 */
export function getTokenAddressForChain(
    token: SupportedToken,
    chainId: number
): string | null {
    return TOKEN_ADDRESSES[chainId]?.[token] || null;
}

/**
 * Get token config (address + decimals) for a specific chain
 */
export function getTokenConfigForChain(
    token: SupportedToken,
    chainId: number
): { address: string; decimals: number } | null {
    const address = getTokenAddressForChain(token, chainId);
    if (!address) return null;

    return {
        address,
        decimals: TOKEN_DECIMALS[token],
    };
}

/**
 * Get token config from a provider (automatically detects chain)
 */
export async function getTokenConfigFromProvider(
    token: SupportedToken,
    provider: any
): Promise<{ address: string; decimals: number } | null> {
    try {
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);
        return getTokenConfigForChain(token, chainId);
    } catch (error) {
        console.error('Failed to get network from provider:', error);
        return null;
    }
}

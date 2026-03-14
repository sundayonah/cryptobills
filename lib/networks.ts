/**
 * Supported blockchain networks configuration
 */

export interface Network {
  id: number;
  name: string;
  chainId: string; // EIP-155 format: eip155:chainId
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl?: string;
}

export const SUPPORTED_NETWORKS: Network[] = [
  {
    id: 8453,
    name: 'Base',
    chainId: 'eip155:8453',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA',
  },
  // Polygon - re-enable in pimlico-gas-usdc branch
  // {
  //   id: 137,
  //   name: 'Polygon',
  //   chainId: 'eip155:137',
  //   nativeCurrency: {
  //     name: 'MATIC',
  //     symbol: 'MATIC',
  //     decimals: 18,
  //   },
  //   rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA',
  // },
  // Arbitrum temporarily disabled
  // {
  //   id: 42161,
  //   name: 'Arbitrum',
  //   chainId: 'eip155:42161',
  //   nativeCurrency: {
  //     name: 'Ether',
  //     symbol: 'ETH',
  //     decimals: 18,
  //   },
  //   rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA',
  // },
  // Avalanche temporarily disabled
  // {
  //   id: 43114,
  //   name: 'Avalanche',
  //   chainId: 'eip155:43114',
  //   nativeCurrency: {
  //     name: 'Avalanche',
  //     symbol: 'AVAX',
  //     decimals: 18,
  //   },
  //   rpcUrl: 'https://avax-mainnet.g.alchemy.com/v2/f9VLG4qggmoQThJmgLuSA',
  // },
  // {
  //   id: 1,
  //   name: 'Ethereum',
  //   chainId: 'eip155:1',
  //   nativeCurrency: {
  //     name: 'Ether',
  //     symbol: 'ETH',
  //     decimals: 18,
  //   },
  //   rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
  // },

  // Base Sepolia commented out - testnet not needed in production
  // {
  //   id: 84532,
  //   name: 'Base Sepolia',
  //   chainId: 'eip155:84532',
  //   nativeCurrency: {
  //     name: 'Ether',
  //     symbol: 'ETH',
  //     decimals: 18,
  //   },
  //   rpcUrl: 'https://sepolia.base.org',
  // },
  // BSC temporarily commented out due to Privy configuration requirements
  // {
  //   id: 56,
  //   name: 'BSC',
  //   chainId: 'eip155:56',
  //   nativeCurrency: {
  //     name: 'BNB',
  //     symbol: 'BNB',
  //     decimals: 18,
  //   },
  //   rpcUrl: 'https://bsc-dataseed.binance.org',
  // },
];

export function getNetworkById(id: number): Network | undefined {
  return SUPPORTED_NETWORKS.find((network) => network.id === id);
}

export function getNetworkByChainId(chainId: string): Network | undefined {
  return SUPPORTED_NETWORKS.find((network) => network.chainId === chainId);
}

/**
 * Application constants
 */

import type { TokenConfig } from '@/types';

// Supported tokens configuration
// Update these addresses based on your network (e.g., Polygon, Ethereum, BSC)
export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon USDC
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: process.env.NEXT_PUBLIC_USDT_ADDRESS || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon USDT
    decimals: 6,
  },
};

// Your wallet address to receive payments
export const PAYMENT_RECIPIENT_ADDRESS = process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS || '';

// Supported chains (update based on your needs)
export const SUPPORTED_CHAINS = [
  {
    id: 137, // Polygon
    name: 'Polygon',
  },
  {
    id: 1, // Ethereum
    name: 'Ethereum',
  },
];

// Minimum and maximum amounts
export const MIN_AMOUNT = 0.1; // Minimum $0.1
export const MAX_AMOUNT = 1000; // Maximum $1000

// Airtime service mappings
export const AIRTIME_SERVICES = {
  MTN: 'mtn_vtu',
  GLO: 'glo_vtu',
  AIRTEL: 'airtel_vtu',
  '9MOBILE': '9mobile_vtu',
} as const;

/**
 * Exchange rate utilities for USDC/USDT to NGN conversion
 * Uses Paycrest aggregator v2 rates API
 */

import type { SupportedToken, ExchangeRateResponse } from '@/types';
import config from './config';
import { fetchPaycrestRateV2 } from './utils';

/** Default network for rate quotes when chain is not specified (bill pay UI). */
const DEFAULT_RATE_NETWORK = 'base';

/**
 * Get exchange rate from Paycrest v2 (NGN per 1 token).
 * @param token - USDC or USDT
 * @param network - Paycrest network slug (base, polygon, arbitrum)
 */
export async function getExchangeRate(
  token: SupportedToken,
  network: string = DEFAULT_RATE_NETWORK,
): Promise<number> {
  try {
    return await fetchPaycrestRateV2({
      token,
      amount: 1,
      currency: 'NGN',
      network,
      side: 'sell',
    });
  } catch (error) {
    console.error(`Error fetching ${token} exchange rate:`, error);
    if (config.fallback_rate > 0) {
      return config.fallback_rate;
    }
    // Last resort: USDT tracks USDC; try USDC if USDT quote fails
    if (token === 'USDT') {
      try {
        return await fetchPaycrestRateV2({
          token: 'USDC',
          amount: 1,
          currency: 'NGN',
          network,
          side: 'sell',
        });
      } catch {
        /* use zero only if everything fails */
      }
    }
    return config.fallback_rate;
  }
}

/**
 * Convert token amount to NGN using PayCrest API with user's specific amount
 * @param tokenAmount - Amount in tokens (from user input)
 * @param token - USDC or USDT
 * @returns NGN amount
 */
export async function convertToNGN(
  tokenAmount: string,
  token: SupportedToken,
  network: string = DEFAULT_RATE_NETWORK,
): Promise<number> {
  try {
    const amount = parseFloat(tokenAmount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid token amount');
    }

    const rate = await getExchangeRate(token, network);
    if (rate <= 0) {
      throw new Error('No valid exchange rate available');
    }
    return Math.round(amount * rate);
  } catch (error) {
    console.error(`Error converting ${tokenAmount} ${token} to NGN:`, error);
    const rate = await getExchangeRate(token, network);
    const amount = parseFloat(tokenAmount);
    return Math.round(amount * rate);
  }
}

export async function getExchangeRates(): Promise<ExchangeRateResponse> {
  const usdcRate = await getExchangeRate('USDC');
  const usdtRate = await getExchangeRate('USDT');

  return {
    usdcToNgn: usdcRate,
    usdtToNgn: usdtRate,
    timestamp: Date.now(),
  };
}

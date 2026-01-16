/**
 * Exchange rate utilities for USDC/USDT to NGN conversion
 * Uses PayCrest API for real-time exchange rates
 */

import type { SupportedToken, ExchangeRateResponse, PayCrestResponse } from '@/types';
import config from './config';

/**
 * Get exchange rate from PayCrest API (rate per token)
 * @param token - USDC or USDT
 * @returns Exchange rate (NGN per token)
 */
export async function getExchangeRate(token: SupportedToken): Promise<number> {
  try {
    // PayCrest API endpoint: /v1/rates/{token}/1/ngn
    // Returns NGN amount for 1 token to get the rate per token
    const tokenLower = token.toLowerCase();
    const url = `${config.paycrest_rate_api}/${tokenLower}/1/ngn`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`PayCrest API error: ${response.status}`);
    }

    const data: PayCrestResponse = await response.json();

    if (data.status === 'success' && data.data) {
      // data.data contains NGN amount for 1 token
      const ngnFor1 = parseFloat(data.data);
      if (isNaN(ngnFor1) || ngnFor1 <= 0) {
        throw new Error('Invalid rate data from API');
      }
      return ngnFor1;
    } else {
      throw new Error(data.message || 'Invalid API response');
    }
  } catch (error) {
    console.error(`Error fetching ${token} exchange rate:`, error);
    // Return fallback rate on error
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
  token: SupportedToken
): Promise<number> {
  try {
    const amount = parseFloat(tokenAmount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid token amount');
    }

    // PayCrest API minimum amount is 0.5
    // For amounts below 0.5, use rate-based calculation (get rate for 1 token, then multiply)
    const PAYCREST_MIN_AMOUNT = 0.5;

    if (amount < PAYCREST_MIN_AMOUNT) {
      // For amounts < 0.5 (e.g., 0.1, 0.2), use rate calculation
      // This works because getExchangeRate() calls /1/ngn which always works
      const rate = await getExchangeRate(token);
      return Math.round(amount * rate);
    }

    // For amounts >= 0.5, use direct API call with specific amount
    // PayCrest API endpoint: /v1/rates/{token}/{amount}/ngn
    // Returns NGN amount for the user's specific token amount
    const tokenLower = token.toLowerCase();
    const url = `${config.paycrest_rate_api}/${tokenLower}/${amount}/ngn`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // If API fails, fallback to rate calculation
      const rate = await getExchangeRate(token);
      return Math.round(amount * rate);
    }

    const data: PayCrestResponse = await response.json();

    if (data.status === 'success' && data.data) {
      // data.data contains NGN amount for the user's token amount
      const ngnAmount = parseFloat(data.data);
      if (isNaN(ngnAmount) || ngnAmount <= 0) {
        throw new Error('Invalid rate data from API');
      }
      return Math.round(ngnAmount);
    } else {
      throw new Error(data.message || 'Invalid API response');
    }
  } catch (error) {
    console.error(`Error converting ${tokenAmount} ${token} to NGN:`, error);
    // Final fallback: use rate calculation if API fails
    const rate = await getExchangeRate(token);
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

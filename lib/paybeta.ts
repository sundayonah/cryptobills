import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  PayBetaProviderResponse,
  AirtimePurchaseRequest,
  AirtimePurchaseResponse,
  PayBetaErrorResponse,
  WalletBalanceResponse,
  TransactionQueryRequest,
  TransactionQueryResponse,
  AirtimeService,
} from '@/types';
import config from './config';

// ============================================
// ERROR TYPES & UTILITIES
// ============================================

/**
 * Custom error for PayBeta API errors
 */
export interface CryptobilzError extends Error {
  statusCode?: number;
  errorCode?: string;
  originalError?: unknown;
}

/**
 * Create a PayBeta error
 */
export function createCryptobilzError(
  message: string,
  statusCode?: number,
  errorCode?: string,
  originalError?: unknown
): CryptobilzError {
  const error = new Error(message) as CryptobilzError;
  error.name = 'CryptobilzError';
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  error.originalError = originalError;
  return error;
}

/**
 * Check if error is a PayBeta error
 */
export function isCryptobilzError(error: unknown): error is CryptobilzError {
  return error instanceof Error && error.name === 'CryptobilzError';
}

// ============================================
// CLIENT TYPES
// ============================================

/**
 * PayBeta client instance
 */
export interface CryptoBilzClient {
  api: AxiosInstance;
  getAirtimeProviders: () => Promise<PayBetaProviderResponse>;
  purchaseAirtime: (request: AirtimePurchaseRequest) => Promise<AirtimePurchaseResponse>;
  getWalletBalance: () => Promise<WalletBalanceResponse>;
  queryTransaction: (request: TransactionQueryRequest) => Promise<TransactionQueryResponse>;
}

// ============================================
// INTERNAL FUNCTIONS
// ============================================

/**
 * Create axios instance with configuration
 */
function createAxiosInstance(apiKey: string): AxiosInstance {
  const instance = axios.create({
    baseURL: config.paybeta_api_base_url,
    timeout: 30000, // 30 seconds
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'P-API-KEY': apiKey,
    },
  });

  // Request interceptor
  instance.interceptors.request.use(
    (config) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[PayBeta] ${config.method?.toUpperCase()} ${config.url}`);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[PayBeta Error]', error.response?.data || error.message);
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

/**
 * Handle and transform errors
 */
function handleError(error: unknown): CryptobilzError {
  // Handle Axios-specific errors
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<PayBetaErrorResponse>;

    if (axiosError.response) {
      // Server responded with an error status
      const { status, data } = axiosError.response;
      return createCryptobilzError(
        data?.message || 'PayBeta API error',
        status,
        data?.errors?.code?.[0] || undefined,
        error
      );
    } else if (axiosError.request) {
      // Request was made but no response received
      return createCryptobilzError(
        'No response from PayBeta API',
        undefined,
        'NETWORK_ERROR',
        error
      );
    }
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    return createCryptobilzError(error.message, undefined, 'UNKNOWN_ERROR', error);
  }

  // Handle unknown error types
  return createCryptobilzError(
    'Unknown error occurred',
    undefined,
    'UNKNOWN_ERROR',
    error
  );
}

// ============================================
// CLIENT CREATION
// ============================================

/**
 * Create PayBeta client
 */
export function createCryptobilzClient(apiKey: string): CryptoBilzClient {
  const api = createAxiosInstance(apiKey);

  return {
    api,

    /**
     * Get available airtime providers
     */
    async getAirtimeProviders(): Promise<PayBetaProviderResponse> {
      try {
        const response = await api.get<PayBetaProviderResponse>('/airtime/providers');
        return response.data;
      } catch (error) {
        throw handleError(error);
      }
    },

    /**
     * Purchase airtime
     */
    async purchaseAirtime(
      request: AirtimePurchaseRequest
    ): Promise<AirtimePurchaseResponse> {
      try {
        const response = await api.post<AirtimePurchaseResponse>(
          '/airtime/purchase',
          request
        );
        return response.data;
      } catch (error) {
        throw handleError(error);
      }
    },

    /**
     * Get wallet balance
     */
    async getWalletBalance(): Promise<WalletBalanceResponse> {
      try {
        const response = await api.get<WalletBalanceResponse>('/wallet/balance');
        return response.data;
      } catch (error) {
        throw handleError(error);
      }
    },

    /**
     * Query transaction status
     */
    async queryTransaction(
      request: TransactionQueryRequest
    ): Promise<TransactionQueryResponse> {
      try {
        const response = await api.post<TransactionQueryResponse>(
          '/wallet/transaction-query',
          request
        );
        return response.data;
      } catch (error) {
        throw handleError(error);
      }
    },
  };
}

// ============================================
// SINGLETON PATTERN
// ============================================

let cryptobilzClient: CryptoBilzClient | null = null;

/**
 * Get or create the PayBeta client singleton instance
 */
export function getCryptobilzClient(): CryptoBilzClient {
  if (!cryptobilzClient) {
    const apiKey = config.paybeta_api_key;
    if (!apiKey) {
      throw new Error('PAYBETA_API_KEY is not set in environment variables');
    }
    cryptobilzClient = createCryptobilzClient(apiKey);
  }
  return cryptobilzClient;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetCryptobilzClient(): void {
  cryptobilzClient = null;
}

/**
 * Compatibility export for legacy code
 * @deprecated Use getCryptobilzClient() instead
 */
export function getPayBetaClient(): CryptoBilzClient {
  return getCryptobilzClient();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Retry a function multiple times
 */
export const withRetry = <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        resolve(result);
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          reject(error);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  });
};

/**
 * Add logging to a function
 */
export const withLogging = <T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    console.log(`[${operationName}] Starting...`);
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      console.log(`[${operationName}] Completed in ${duration}ms`);
      resolve(result);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${operationName}] Failed after ${duration}ms`, error);
      reject(error);
    }
  });
};

// ============================================
// COMMON USE CASES
// ============================================

/**
 * Get available airtime providers
 */
export async function getProviders() {
  try {
    const client = getCryptobilzClient();
    const response = await client.getAirtimeProviders();

    if (response.status === 'successful') {
      return response.data;
    }
  } catch (error) {
    if (isCryptobilzError(error)) {
      console.error('PayBeta Error:', {
        message: error.message,
        statusCode: error.statusCode,
        errorCode: error.errorCode,
      });
    }
    throw error;
  }
}

/**
 * Purchase airtime
 */
export async function purchaseAirtime(
  service: AirtimeService,
  phoneNumber: string,
  amount: number,
  reference?: string
) {
  try {
    const client = getCryptobilzClient();

    const request: AirtimePurchaseRequest = {
      service,
      phoneNumber,
      amount,
      reference: reference || `REF-${Date.now()}`,
    };

    const response = await client.purchaseAirtime(request);

    if (response.status === 'successful' && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Purchase failed');
  } catch (error) {
    if (isCryptobilzError(error)) {
      switch (error.errorCode) {
        case 'INSUFFICIENT_BALANCE':
          throw new Error('Insufficient wallet balance');
        case 'INVALID_PHONE_NUMBER':
          throw new Error('Invalid phone number provided');
        case 'NETWORK_ERROR':
          throw new Error('Network error, please try again');
        default:
          throw new Error(error.message);
      }
    }
    throw error;
  }
}

/**
 * Get wallet balance
 */
export async function checkBalance() {
  try {
    const client = getCryptobilzClient();
    const response = await client.getWalletBalance();

    if (response.status === 'successful' && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to fetch balance');
  } catch (error) {
    if (isCryptobilzError(error)) {
      throw new Error(`Failed to fetch balance: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Query transaction status
 */
export async function queryTransaction(transactionId: string) {
  try {
    const client = getCryptobilzClient();

    const request: TransactionQueryRequest = {
      transactionId,
    };

    const response = await client.queryTransaction(request);

    if (response.status === 'successful' && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Query failed');
  } catch (error) {
    if (isCryptobilzError(error)) {
      throw new Error(`Query failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Poll transaction status until completion
 */
export async function pollTransactionStatus(
  transactionId: string,
  maxAttempts: number = 5,
  delayMs: number = 3000
): Promise<'completed' | 'failed'> {
  const client = getCryptobilzClient();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const request: TransactionQueryRequest = { transactionId };
      const response = await client.queryTransaction(request);

      if (response.data && (response.data.status === 'successful' || response.data.status === 'failed')) {
        return response.data.status === 'successful' ? 'completed' : 'failed';
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`Attempt ${attempt}/${maxAttempts}: Transaction still pending...`);
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Transaction status polling timeout');
}

/**
 * Complete purchase flow with automatic provider selection
 */
export async function completePurchaseFlow(
  phoneNumber: string,
  amount: number
) {
  const client = getCryptobilzClient();

  try {
    // Step 1: Check balance
    const balanceResponse = await client.getWalletBalance();
    if (balanceResponse.data && balanceResponse.data.balance < amount) {
      throw new Error('Insufficient balance');
    }

    // Step 2: Get providers
    const providersResponse = await client.getAirtimeProviders();
    const provider = providersResponse.data.find((p) => p.status);
    if (!provider) {
      throw new Error('No active provider found');
    }

    // Step 3: Purchase airtime
    const purchaseResponse = await client.purchaseAirtime({
      service: 'mtn_vtu' as AirtimeService, // Default service
      phoneNumber,
      amount,
      reference: `FLOW-${Date.now()}`,
    });

    // Step 4: Poll for completion if pending
    if (purchaseResponse.data && purchaseResponse.data.transactionId) {
      const finalStatus = await pollTransactionStatus(
        purchaseResponse.data.transactionId
      );
      return {
        ...purchaseResponse.data,
        status: finalStatus,
      };
    }

    return purchaseResponse.data;
  } catch (error) {
    if (isCryptobilzError(error)) {
      throw new Error(`Purchase flow failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Purchase airtime with retry and logging
 */
export async function purchaseAirtimeWithRetry(
  service: AirtimeService,
  phoneNumber: string,
  amount: number
) {
  const client = getCryptobilzClient();

  return withLogging(
    () =>
      withRetry(() =>
        client.purchaseAirtime({
          service,
          phoneNumber,
          amount,
          reference: `RETRY-${Date.now()}`,
        })
      ),
    'Purchase Airtime'
  );
}

// ============================================
// EXAMPLE: Next.js API Route Handler
// ============================================

/**
 * Example Next.js API route for purchasing airtime
 * 
 * Usage:
 * ```typescript
 * // app/api/airtime/purchase/route.ts
 * import { NextRequest, NextResponse } from 'next/server';
 * import { handlePurchaseAirtimeRequest } from '@/lib/paybeta-client';
 * 
 * export async function POST(request: NextRequest) {
 *   return handlePurchaseAirtimeRequest(request);
 * }
 * ```
 */
export async function handlePurchaseAirtimeRequest(request: any) {
  try {
    const body = await request.json();
    const { service, phoneNumber, amount } = body;

    // Validate input
    if (!service || !phoneNumber || !amount) {
      return {
        status: 400,
        json: { error: 'Missing required fields' },
      };
    }

    // Purchase airtime
    const result = await purchaseAirtime(service as AirtimeService, phoneNumber, amount);

    return {
      status: 200,
      json: { success: true, data: result },
    };
  } catch (error) {
    if (isCryptobilzError(error)) {
      return {
        status: error.statusCode || 500,
        json: { error: error.message, code: error.errorCode },
      };
    }

    return {
      status: 500,
      json: { error: 'Internal server error' },
    };
  }
}

// ============================================
// EXAMPLE: React Hook
// ============================================

/**
 * React hook for PayBeta operations
 * 
 * Usage:
 * ```typescript
 * const { execute, loading, error } = useCryptoBilz();
 * 
 * const handlePurchase = async () => {
 *   const result = await execute((client) =>
 *     client.purchaseAirtime({ service: 'mtn_vtu', phoneNumber: '+123', amount: 100 })
 *   );
 * };
 * ```
 */
export function useCryptoBilz() {
  // This would need React imports in actual usage
  let loading = false;
  let error: string | null = null;

  const execute = async <T,>(
    operation: (client: CryptoBilzClient) => Promise<T>
  ): Promise<T | null> => {
    loading = true;
    error = null;

    try {
      const client = getCryptobilzClient();
      const result = await operation(client);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      error = errorMessage;
      return null;
    } finally {
      loading = false;
    }
  };

  return { execute, loading, error };
}
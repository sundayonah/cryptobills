/**
 * All Types and Interfaces
 */

// ============================================================================
// Web3 Wallet Types
// ============================================================================

export type SupportedToken = 'USDC' | 'USDT';

export interface TokenConfig {
    symbol: SupportedToken;
    name: string;
    address: string; // Contract address
    decimals: number;
    logo?: string;
}

export interface WalletConnection {
    address: string;
    chainId: number;
    isConnected: boolean;
}

export interface TokenBalance {
    token: SupportedToken;
    balance: string;
    formatted: string;
    decimals: number;
}

export interface PaymentRequest {
    token: SupportedToken;
    amount: string; // Amount in token (e.g., "1.0" for $1 USDC)
    recipientAddress: string; // Your wallet address to receive payments
}

export interface PaymentTransaction {
    hash: string;
    from: string;
    to: string;
    amount: string;
    token: SupportedToken;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
}

// ============================================================================
// PayBeta API Types
// ============================================================================

export type UtilityBillCategory =
    | 'airtime'
    | 'data_bundle'
    | 'cable_tv'
    | 'electricity'
    | 'showmax'
    | 'gaming';

export type AirtimeProvider = {
    name: string;
    category: string;
    status: boolean;
    logo: string;
};

export type PayBetaProviderResponse = {
    status: string;
    message: string;
    data: AirtimeProvider[];
};

export type AirtimeService = 'mtn_vtu' | 'glo_vtu' | 'airtel_vtu' | '9mobile_vtu';

export interface AirtimePurchaseRequest {
    service: AirtimeService;
    phoneNumber: string;
    amount: number;
    reference: string;
}

export interface AirtimePurchaseResponse {
    status: string;
    message: string;
    data?: {
        reference: string;
        amount: number;
        chargedAmount: number;
        commission: number;
        biller: string;
        customerId: string;
        previousBalance: number;
        currentBalance: number;
        transactionDate: string;
        transactionId: string;
    };
}

export interface PayBetaErrorResponse {
    status: string;
    message: string;
    errors?: Record<string, string[]>;
}

export interface WalletBalanceResponse {
    status: string;
    message: string;
    data: {
        balance: number;
        currency: string;
    };
}

export interface TransactionQueryRequest {
    reference?: string;
    transactionId?: string;
}

export interface TransactionQueryResponse {
    status: string;
    message: string;
    data: {
        transactionId: string;
        reference: string;
        status: 'successful' | 'pending' | 'failed';
        amount: number;
        phoneNumber: string;
        service: string;
        createdAt: string;
    };
}

// ============================================================================
// Transaction Types
// ============================================================================

export type TransactionStatus =
    | 'pending_payment'
    | 'payment_received'
    | 'converting'
    | 'processing'
    | 'completed'
    | 'failed';

export interface AirtimeTransaction {
    id: string;
    userId: string;
    walletAddress: string;

    // Payment details
    token: SupportedToken;
    tokenAmount: string;
    ngnAmount: number;
    exchangeRate: number;
    paymentTxHash?: string;

    // Airtime details
    phoneNumber: string;
    service: AirtimeService;
    airtimeAmount: number;
    paybetaReference: string;
    paybetaTransactionId?: string;

    // Status tracking
    status: TransactionStatus;
    errorMessage?: string;

    // Timestamps
    createdAt: Date;
    paymentReceivedAt?: Date;
    completedAt?: Date;
}

export interface TransactionCreateInput {
    userId: string;
    walletAddress: string;
    token: SupportedToken;
    tokenAmount: string;
    phoneNumber: string;
    service: AirtimeService;
    airtimeAmount: number;
    paymentTxHash?: string;
}

export interface ExchangeRateResponse {
    usdcToNgn: number;
    usdtToNgn: number;
    timestamp: number;
}


export interface PayCrestResponse {
    status: string;
    message: string;
    data: string; // NGN amount for the specified token amount
    metadata: null;
}

export interface Config {
    paycrest_rate_api: string;
    fallback_rate: number;
    paybeta_api_key: string;
    paybeta_base_url: string;
}

// ============================================================================
// Window Type Declarations
// ============================================================================

declare global {
    interface Window {
        ethereum?: {
            isMetaMask?: boolean;
            request: (args: { method: string; params?: any[] }) => Promise<any>;
            on: (event: string, handler: (...args: any[]) => void) => void;
            removeListener: (event: string, handler: (...args: any[]) => void) => void;
        };
    }
}

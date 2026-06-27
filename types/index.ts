/**
 * All Types and Interfaces
 */

// ============================================================================
// Web3 Wallet Types
// ============================================================================

export type SupportedToken = 'USDC' | 'USDT';

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
    | 'transfer'
    | 'showmax'
    | 'gaming';

export type AirtimeProvider = {
    id?: string;
    name: string;
    category: string;
    status?: boolean; // Optional - not always present in API response
    slug?: string; // Service slug (e.g., 'mtn_vtu', 'glo_vtu')
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

export type DataBundleService = 'mtn_data' | 'glo_data' | 'airtel_data' | '9mobile_data';

export interface DataBundlePackage {
    code: string;
    description: string;
    price: string;
}

export interface DataBundleListResponse {
    status: string;
    message: string;
    data?: {
        packages: DataBundlePackage[];
    };
}

export interface DataBundlePurchaseRequest {
    service: DataBundleService;
    phoneNumber: string;
    amount: number;
    code: string; // Bundle code (e.g., "MTN_100_MB_DAILY_DATA_BUNDLE" or "MT1")
    reference: string;
}

export interface DataBundlePurchaseResponse {
    status: string;
    message: string;
    data?: {
        reference: string;
        amount: number;
        chargedAmount: number;
        commission: number;
        biller: string;
        customerId: string;
        token: null;
        unit: null;
        bonusToken: null;
        transactionDate: string;
        transactionId: string;
    };
}

// ============================================================================
// Electricity Types
// ============================================================================

export type ElectricityService = string; // e.g., 'ikeja-electric', 'enugu-electric', 'abuja-electric'

export interface ElectricityValidationRequest {
    service: string;
    meterNumber: string;
    meterType: 'prepaid' | 'postpaid';
}

export interface ElectricityValidationResponse {
    status: string;
    message: string;
    data?: {
        customerName: string;
        customerAddress: string;
        meterNumber: string;
        meterType: string;
        minimumVendAmount: number;
    };
}

export interface ElectricityPurchaseRequest {
    service: string;
    meterNumber: string;
    meterType: 'prepaid' | 'postpaid';
    amount: number;
    customerName: string;
    customerAddress: string;
    reference: string;
}

export interface ElectricityPurchaseResponse {
    status: string;
    message: string;
    data?: {
        reference: string;
        amount: number;
        chargedAmount: number;
        commission: number;
        biller: string;
        customerId: string;
        token: string; // For prepaid meters
        unit: string; // Units purchased
        bonusToken: string;
        transactionDate: string;
        transactionId: string;
    };
}

// ============================================================================
// Gaming (betting wallets) — PayBeta docs: POST /v2/gaming/validate; with PAYBETA_BASE_URL=.../v2 use path /gaming/*
// ============================================================================

export interface GamingValidationResponse {
    status: string;
    message: string;
    data?: {
        customerName: string;
        customerId: string;
        service: string;
        minimumAmount: number;
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
        availableBalance: number;
        lienAmount: number;
    };
}

export interface TransactionQueryRequest {
    reference: string; // Required: PayBeta uses reference to query transaction status
}

export interface TransactionQueryResponse {
    status: string; // 'successful', 'failed', or 'pending'
    message: string;
    code: string; // '00' = successful, '01' = pending, '02' = failed, '99' = not found
    data?: {
        paymentStatus: string; // 'Delivered', 'Pending', 'Failed', etc.
        reference: string;
        amount: number;
        amountPaid: number;
        chargedAmount?: number | string;
        commission?: number | string;
        product: string; // e.g., "GLO AIRTIME", "ABUJA ELECTRIC"
        customerId: string;
        biller?: string;
        token: string; // Electricity token (for electricity purchases) or "0" for non-electricity
        unit: string; // Electricity units (for electricity purchases) or "0" for non-electricity
        transactionId: string; // PayBeta's internal transaction ID
        transactionDate: string; // ISO date string
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

/**
 * Serialized transaction from `GET /api/transactions` (fields used by the history drawer).
 */
export interface TransactionHistoryItem {
    id: string;
    category: string;
    serviceName?: string;
    status: string;
    token: string;
    tokenAmount: string;
    ngnAmount: number;
    serviceAmount: number;
    phoneNumber?: string;
    meterNumber?: string;
    accountNumber?: string;
    electricityToken?: string;
    electricityUnit?: string;
    paybetaReference: string;
    paybetaTransactionId?: string;
    createdAt: string;
    completedAt?: string;
    errorMessage?: string;
    paymentTxHash?: string;
    /** Escrow → treasury forward after successful utility bill */
    treasuryForwardTxHash?: string | null;
    refundTxHash?: string | null;
    networkName?: string;
    networkChainId?: number | null;
}

export interface TransactionHistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
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

export type PaycrestRateSide = 'buy' | 'sell';

export interface PaycrestV2RateQuoteSide {
    rate: string;
    providerIds?: string[];
    orderType?: string;
    refundTimeoutMinutes?: number;
}

export interface PaycrestV2RateQuoteResponse {
    buy?: PaycrestV2RateQuoteSide | null;
    sell?: PaycrestV2RateQuoteSide | null;
}

export interface PaycrestAggregatorRateEnvelope {
    status: string;
    message?: string;
    data?: PaycrestV2RateQuoteResponse;
}

export interface FetchPaycrestRateV2Params {
    token: string;
    amount: number;
    currency: string;
    network: string;
    side: PaycrestRateSide;
    providerId?: string;
    signal?: AbortSignal;
}

// ============================================================================
// Onramp / fiat deposit
// ============================================================================

export type OnrampOrder = {
    id: string;
    status: string;
    /** ISO timestamp when the virtual-account funding window ends (v2 sender order). */
    validUntil: string | null;
    providerAccount: {
        institution: string;
        accountName: string;
        accountIdentifier: string;
    } | null;
    /** On-chain settlement / payout tx when PayCrest exposes it (e.g. after `settled`). */
    paymentTxHash: string | null;
};

export type DepositRateData = {
    token: string;
    network: string;
    rate: number;
};

/** Minimum estimated stablecoin receive for fiat deposits (UI + API validation). */
export const MIN_DEPOSIT_RECEIVE_STABLE = 0.5;

export interface Config {
    paycrest_rate_api: string;
    paycrest_onramp_api_url: string;
    paycrest_sender_api_key: string;
    paycrest_refund_institution: string;
    paycrest_refund_account_number: string;
    paycrest_refund_account_name: string;
    fallback_rate: number;
    transaction_rate_adjustment: number;
    paybeta_api_key: string;
    paybeta_base_url: string;
    payment_escrow_address: string;
    payment_recipient_address: string;
    min_amount: number;
    max_amount: number;
    alchemy_api_key: string;
    sponsor_evm_wallet_private_key: string;
    supportkit_api_key: string;
    floating_logos_enabled: boolean;
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

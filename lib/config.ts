import type { Config } from '@/types';

const config: Config = {
    // Server-only (API routes)
    paybeta_api_key: process.env.PAYBETA_API_KEY || '',
    paybeta_base_url: process.env.PAYBETA_BASE_URL || '',
    sponsor_evm_wallet_private_key: (process.env.SPONSOR_EVM_WALLET_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? '').trim(),
    paycrest_onramp_api_url: process.env.PAYCREST_ONRAMP_API_URL || '',
    paycrest_sender_api_key: process.env.PAYCREST_SENDER_API_KEY || '',
    paycrest_refund_institution: process.env.PAYCREST_REFUND_INSTITUTION || '',
    paycrest_refund_account_number: process.env.PAYCREST_REFUND_ACCOUNT_NUMBER || '',
    paycrest_refund_account_name: process.env.PAYCREST_REFUND_ACCOUNT_NAME || '',

    // Client-side accessible (used in components)
    min_amount: parseFloat(process.env.NEXT_PUBLIC_MIN_AMOUNT || '0.1'),
    max_amount: parseFloat(process.env.NEXT_PUBLIC_MAX_AMOUNT || '1000'),
    fallback_rate: parseFloat(process.env.NEXT_PUBLIC_FALLBACK_RATE || '0'),
    transaction_rate_adjustment: parseFloat(process.env.NEXT_PUBLIC_TRANSACTION_RATE_ADJUSTMENT || '0.03'),
    paycrest_rate_api: process.env.NEXT_PUBLIC_PAYCREST_RATE_API || '',
    payment_recipient_address: process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS || '',
    alchemy_api_key: process.env.ALCHEMY_API_KEY || '',
}

export default config;
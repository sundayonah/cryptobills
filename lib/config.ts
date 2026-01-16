// fetch environment variables

import type { Config } from '@/types';

const config: Config = {
    // Server-only (API routes)
    paybeta_api_key: process.env.PAYBETA_API_KEY || '',
    paybeta_base_url: process.env.PAYBETA_BASE_URL || '',

    // Client-side accessible (used in components)
    min_amount: parseFloat(process.env.NEXT_PUBLIC_MIN_AMOUNT || '0.1'),
    max_amount: parseFloat(process.env.NEXT_PUBLIC_MAX_AMOUNT || '1000'),
    fallback_rate: parseFloat(process.env.NEXT_PUBLIC_FALLBACK_RATE || '0'),
    paycrest_rate_api: process.env.NEXT_PUBLIC_PAYCREST_RATE_API || '',
    payment_recipient_address: process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS || '',
}

export default config;
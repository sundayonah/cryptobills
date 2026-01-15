// fetch environment variables

import type { Config } from '@/types';

const config: Config = {
    paycrest_rate_api: process.env.PAYCREST_RATE_API || '',
    fallback_rate: parseFloat(process.env.FALLBACK_RATE || '0'),
    paybeta_api_key: process.env.PAYBETA_API_KEY || '',
    paybeta_base_url: process.env.PAYBETA_BASE_URL || '',
}

export default config;
import { NextResponse } from 'next/server';
import { getPayBetaClient } from '@/lib/paybeta';
import type { AirtimeProvider, PayBetaProviderResponse } from '@/types';

/**
 * GET /api/electricity/providers
 * Get available electricity providers
 */
export async function GET() {
    try {
        const paybeta = getPayBetaClient();
        const response = await paybeta.api.get<PayBetaProviderResponse>('/electricity/providers');

        if (response.data.status === 'successful' && response.data.data) {
            // Map providers to include service field (use slug as service)
            const providers = response.data.data
                .filter(provider => provider.status !== false)
                .map(provider => {
                    // Use slug if available, otherwise derive from name
                    let service = provider.slug || '';

                    if (!service && provider.name) {
                        // Map provider names to service slugs
                        const nameLower = provider.name.toLowerCase();
                        if (nameLower.includes('ikeja')) {
                            service = 'ikeja-electric';
                        } else if (nameLower.includes('enugu') || nameLower.includes('eedc')) {
                            service = 'enugu-electric';
                        } else if (nameLower.includes('abuja') || nameLower.includes('aedc')) {
                            service = 'abuja-electric';
                        } else {
                            // Fallback: create slug from name
                            service = provider.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                        }
                    }

                    return {
                        ...provider,
                        service,
                    };
                });

            return NextResponse.json({
                status: 'successful',
                message: response.data.message,
                data: providers,
            });
        }

        return NextResponse.json(
            {
                status: 'error',
                message: 'Invalid response from electricity providers API',
                data: [],
            },
            { status: 500 }
        );
    } catch (error: any) {
        console.error('Error fetching electricity providers:', error.message || error);

        return NextResponse.json(
            {
                status: 'error',
                message: error.response?.data?.message || error.message || 'Failed to fetch electricity providers',
                data: [],
            },
            { status: error.response?.status || error.statusCode || 500 }
        );
    }
}

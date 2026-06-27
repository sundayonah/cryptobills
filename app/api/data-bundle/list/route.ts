import { NextRequest, NextResponse } from 'next/server';
import { getPayBetaClient } from '@/lib/paybeta';
import type { DataBundleService, DataBundleListResponse } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/data-bundle/list?service=mtn_data
 * Get available data bundle packages for a service
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const service = searchParams.get('service') as DataBundleService;

        if (!service) {
            return NextResponse.json(
                { error: 'Service parameter is required. Example: ?service=mtn_data' },
                { status: 400 }
            );
        }

        const validServices: DataBundleService[] = ['mtn_data', 'glo_data', 'airtel_data', '9mobile_data'];
        if (!validServices.includes(service)) {
            return NextResponse.json(
                { error: `Invalid service. Must be one of: ${validServices.join(', ')}` },
                { status: 400 }
            );
        }

        try {
            const paybeta = getPayBetaClient();
            const response = await paybeta.api.post<DataBundleListResponse>('/data-bundle/list', {
                service,
            });

            if (response.data.status === 'successful' && response.data.data) {
                return NextResponse.json(response.data);
            }

            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Invalid response from data bundle list API',
                    data: { packages: [] },
                },
                { status: 500 }
            );
        } catch (error: any) {
            console.error('Error fetching data bundle list:', error.message || error);

            return NextResponse.json(
                {
                    status: 'error',
                    message: error.response?.data?.message || error.message || 'Failed to fetch data bundle packages',
                    data: { packages: [] },
                },
                { status: error.response?.status || error.statusCode || 500 }
            );
        }
    } catch (error: any) {
        console.error('Error in data bundle list endpoint:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch data bundle packages' },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPayBetaClient } from '@/lib/paybeta';

const bouquetSchema = z.object({
    service: z.string().min(1, 'Service is required'),
});

/**
 * POST /api/cable/bouquet
 * Get cable TV bouquet packages for a service
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validated = bouquetSchema.parse(body);

        const paybeta = getPayBetaClient();
        const response = await paybeta.api.post('/cable/bouquet', {
            service: validated.service,
        });

        if (response.data.status === 'successful' && response.data.data) {
            return NextResponse.json(response.data);
        }

        return NextResponse.json(
            {
                status: 'error',
                message: response.data.message || 'Failed to fetch bouquet packages',
                data: null,
            },
            { status: 500 }
        );
    } catch (error: any) {
        console.error('Error fetching cable bouquet:', error.message || error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Validation error',
                    errors: error.errors,
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                status: 'error',
                message: error.response?.data?.message || error.message || 'Failed to fetch bouquet packages',
                data: null,
            },
            { status: error.response?.status || error.statusCode || 500 }
        );
    }
}

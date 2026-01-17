import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPayBetaClient } from '@/lib/paybeta';
import type { ElectricityValidationResponse } from '@/types';

const validateSchema = z.object({
    service: z.string().min(1, 'Service is required'),
    meterNumber: z.string().min(1, 'Meter number is required'),
    meterType: z.enum(['prepaid', 'postpaid'], {
        errorMap: () => ({ message: 'Meter type must be prepaid or postpaid' }),
    }),
});

/**
 * POST /api/electricity/validate
 * Validate electricity meter number
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validated = validateSchema.parse(body);

        const paybeta = getPayBetaClient();
        const response = await paybeta.api.post<ElectricityValidationResponse>('/electricity/validate', {
            service: validated.service,
            meterNumber: validated.meterNumber,
            meterType: validated.meterType,
        });

        if (response.data.status === 'successful' && response.data.data) {
            return NextResponse.json(response.data);
        }

        return NextResponse.json(
            {
                status: 'error',
                message: response.data.message || 'Failed to validate meter number',
                data: null,
            },
            { status: 400 }
        );
    } catch (error: any) {
        console.error('Error validating electricity meter:', error.message || error);

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
                message: error.response?.data?.message || error.message || 'Failed to validate meter number',
                data: null,
            },
            { status: error.response?.status || error.statusCode || 500 }
        );
    }
}

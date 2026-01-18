import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPayBetaClient } from '@/lib/paybeta';

const validateSchema = z.object({
    service: z.string().min(1, 'Service is required'),
    smartCardNumber: z.string().min(1, 'Smart card number is required'),
});

/**
 * POST /api/cable/validate
 * Validate cable TV smart card number
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validated = validateSchema.parse(body);

        const paybeta = getPayBetaClient();
        const response = await paybeta.api.post('/cable/validate', {
            service: validated.service,
            smartCardNumber: validated.smartCardNumber,
        });

        if (response.data.status === 'successful' && response.data.data) {
            return NextResponse.json(response.data);
        }

        // Return 400 for validation failures (user input errors), not 500 (server errors)
        return NextResponse.json(
            {
                status: 'error',
                message: response.data.message || 'Failed to validate smart card number',
                data: null,
            },
            { status: 400 }
        );
    } catch (error: any) {
        console.error('Error validating cable smart card:', error.message || error);

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
                message: error.response?.data?.message || error.message || 'Failed to validate smart card number',
                data: null,
            },
            { status: error.response?.status || error.statusCode || 500 }
        );
    }
}

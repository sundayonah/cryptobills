import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPayBetaClient } from '@/lib/paybeta';
import type { GamingValidationResponse } from '@/types';

const validateSchema = z.object({
  service: z.string().min(1, 'Service is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
});

/**
 * POST /api/gaming/validate
 * Proxies to PayBeta: base URL should include /v2 (e.g. https://api.paybeta.ng/v2/), path gaming/validate.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = validateSchema.parse(body);

    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post<GamingValidationResponse>('/gaming/validate', {
      service: validated.service,
      customerId: validated.customerId.trim(),
    });

    if (response.data.status === 'successful' && response.data.data) {
      return NextResponse.json(response.data);
    }

    return NextResponse.json(
      {
        status: 'error',
        message: response.data.message || 'Failed to validate gaming account',
        data: null,
      },
      { status: 400 }
    );
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: { message?: string }; status?: number }; errors?: unknown };
    console.error('Error validating gaming account:', err.message || error);

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
        message: err.response?.data?.message || err.message || 'Failed to validate gaming account',
        data: null,
      },
      { status: err.response?.status || 500 }
    );
  }
}

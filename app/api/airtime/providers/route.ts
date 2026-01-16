import { NextResponse } from 'next/server';
import { getPayBetaClient } from '@/lib/paybeta';

export async function GET() {
  try {
    const paybeta = getPayBetaClient();
    const providers = await paybeta.getAirtimeProviders();

    // Return providers if API call successful
    if (providers.status === 'successful' && providers.data) {
      return NextResponse.json(providers);
    }

    // Return error if API response is invalid
    return NextResponse.json(
      {
        status: 'error',
        message: 'Invalid response from providers API',
        data: [],
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Error fetching providers:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Failed to fetch providers',
        data: [],
      },
      { status: error.statusCode || 500 }
    );
  }
}

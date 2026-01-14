import { NextResponse } from 'next/server';
import { getPayBetaClient } from '@/lib/paybeta';
import { FALLBACK_PROVIDERS } from '@/lib/providers';

export async function GET() {
  try {
    const paybeta = getPayBetaClient();
    const providers = await paybeta.getAirtimeProviders();

    // Return providers if API call successful
    if (providers.status === 'successful' && providers.data) {
      return NextResponse.json(providers);
    }

    // Return fallback if API response is invalid
    return NextResponse.json({
      status: 'successful',
      message: 'Request processed successfully.',
      data: FALLBACK_PROVIDERS,
    });
  } catch (error: any) {
    console.error('Error fetching providers:', error);
    // Return fallback providers on error (e.g., API key not enabled)
    return NextResponse.json({
      status: 'successful',
      message: 'Request processed successfully.',
      data: FALLBACK_PROVIDERS,
    });
  }
}

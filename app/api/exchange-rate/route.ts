import { NextResponse } from 'next/server';
import { getExchangeRates } from '@/lib/exchange';

// Exchange rates must be fresh; prevent Vercel/edge caching.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const rates = await getExchangeRates();
    return NextResponse.json(rates, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('Error fetching exchange rates:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch exchange rates' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}

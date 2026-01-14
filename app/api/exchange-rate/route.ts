import { NextResponse } from 'next/server';
import { getExchangeRates } from '@/lib/exchange';

export async function GET() {
  try {
    const rates = await getExchangeRates();
    return NextResponse.json(rates);
  } catch (error: any) {
    console.error('Error fetching exchange rates:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch exchange rates' },
      { status: 500 }
    );
  }
}

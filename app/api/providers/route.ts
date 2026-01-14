import { NextRequest, NextResponse } from 'next/server';
import { getPayBetaClient } from '@/lib/paybeta';
import { FALLBACK_PROVIDERS } from '@/lib/providers';
import type { UtilityBillCategory } from '@/types';

/**
 * Generic providers endpoint that works for any category
 * GET /api/providers?category=airtime
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as UtilityBillCategory;

    if (!category) {
      return NextResponse.json(
        { error: 'Category parameter is required' },
        { status: 400 }
      );
    }

    // Map category to API path
    const categoryMap: Record<UtilityBillCategory, string> = {
      airtime: '/airtime/providers',
      data_bundle: '/data-bundle/providers',
      cable_tv: '/cable-tv/providers',
      electricity: '/electricity/providers',
      showmax: '/showmax/bouquets',
      gaming: '/gaming/providers',
    };

    const apiPath = categoryMap[category];
    if (!apiPath) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    try {
      const paybeta = getPayBetaClient();
      
      // Use axios directly for dynamic paths
      const response = await paybeta.api.get(apiPath);
      
      if (response.data.status === 'successful' && response.data.data) {
        return NextResponse.json(response.data);
      }
      
      // Return fallback for airtime only
      if (category === 'airtime') {
        return NextResponse.json({
          status: 'successful',
          message: 'Request processed successfully.',
          data: FALLBACK_PROVIDERS,
        });
      }
      
      return NextResponse.json({
        status: 'successful',
        message: 'Request processed successfully.',
        data: [],
      });
    } catch (error: any) {
      console.error(`Error fetching ${category} providers:`, error);
      
      // Return fallback for airtime only
      if (category === 'airtime') {
        return NextResponse.json({
          status: 'successful',
          message: 'Request processed successfully.',
          data: FALLBACK_PROVIDERS,
        });
      }
      
      return NextResponse.json({
        status: 'successful',
        message: 'Request processed successfully.',
        data: [],
      });
    }
  } catch (error: any) {
    console.error('Error in providers endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch providers' },
      { status: 500 }
    );
  }
}

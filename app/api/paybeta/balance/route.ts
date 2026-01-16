import { NextRequest, NextResponse } from 'next/server';
import { getCryptobilzClient } from '@/lib/paybeta';

/**
 * GET /api/paybeta/balance
 * Check PayBeta wallet balance (server-side only)
 */
export async function GET(request: NextRequest) {
    try {
        const paybetaClient = getCryptobilzClient();
        const balanceResponse = await paybetaClient.getWalletBalance();

        if (balanceResponse.status !== 'successful' || !balanceResponse.data) {
            return NextResponse.json(
                {
                    success: false,
                    error: balanceResponse.message || 'Failed to check PayBeta wallet balance',
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                availableBalance: balanceResponse.data.availableBalance,
                lienAmount: balanceResponse.data.lienAmount,
            },
        });
    } catch (error: any) {
        console.error('Error checking PayBeta balance:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to check PayBeta balance',
            },
            { status: 500 }
        );
    }
}

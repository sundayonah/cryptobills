import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPayBetaClient } from '@/lib/paybeta';
import { convertToNGN } from '@/lib/exchange';
import { PAYMENT_RECIPIENT_ADDRESS } from '@/lib/constants';
import type { SupportedToken, AirtimeService } from '@/types';

const purchaseSchema = z.object({
  walletAddress: z.string().min(1),
  privyUserId: z.string().optional(),
  token: z.enum(['USDC', 'USDT']),
  tokenAmount: z.string().regex(/^\d+(\.\d+)?$/),
  phoneNumber: z.string().regex(/^0\d{10}$/, 'Invalid Nigerian phone number'),
  service: z.enum(['mtn_vtu', 'glo_vtu', 'airtel_vtu', '9mobile_vtu']),
  paymentTxHash: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = purchaseSchema.parse(body);

    // Verify payment transaction (you should implement proper verification)
    if (!validated.paymentTxHash) {
      return NextResponse.json(
        { error: 'Payment transaction hash is required' },
        { status: 400 }
      );
    }

    // Convert token amount to NGN
    const ngnAmount = await convertToNGN(validated.tokenAmount, validated.token as SupportedToken);
    const exchangeRate = ngnAmount / parseFloat(validated.tokenAmount);

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress: validated.walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress: validated.walletAddress,
          privyUserId: validated.privyUserId,
        },
      });
    } else if (validated.privyUserId && !user.privyUserId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { privyUserId: validated.privyUserId },
      });
    }

    // Generate unique reference
    const reference = `CRYPTOBILZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        walletAddress: validated.walletAddress,
        token: validated.token,
        tokenAmount: validated.tokenAmount,
        ngnAmount,
        exchangeRate,
        paymentTxHash: validated.paymentTxHash,
        phoneNumber: validated.phoneNumber,
        service: validated.service,
        airtimeAmount: ngnAmount, // Use NGN amount as airtime amount
        paybetaReference: reference,
        status: 'payment_received',
      },
    });

    // Purchase airtime via PayBeta
    // PayBeta API requires amount as integer
    const paybeta = getPayBetaClient();
    const airtimeResponse = await paybeta.purchaseAirtime({
      service: validated.service as AirtimeService,
      phoneNumber: validated.phoneNumber,
      amount: Math.round(ngnAmount), // Ensure integer
      reference,
    });

    // Update transaction with PayBeta response
    if (airtimeResponse.status === 'successful' && airtimeResponse.data) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'completed',
          paybetaTransactionId: airtimeResponse.data.transactionId,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'completed',
          paybetaReference: airtimeResponse.data.reference,
          paybetaTransactionId: airtimeResponse.data.transactionId,
        },
      });
    } else {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          errorMessage: airtimeResponse.message || 'PayBeta purchase failed',
        },
      });

      return NextResponse.json(
        { error: airtimeResponse.message || 'Failed to purchase airtime' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Purchase error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

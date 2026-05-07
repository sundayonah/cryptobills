import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getExchangeRate } from '@/lib/exchange';
import config from '@/lib/config';
import { getNetworkById } from '@/lib/networks';
import { processPayment } from '@/lib/payment-processors';
import { getCryptobilzClient } from '@/lib/paybeta';
import { normalizeWalletAddress } from '@/lib/utils';
import {
  settleUtilityEscrowOnBillFailure,
  settleUtilityEscrowOnBillSuccess,
  verifyUtilityInboundPayment,
} from '@/lib/utility-escrow';
import type { SupportedToken, UtilityBillCategory } from '@/types';

const purchaseSchema = z.object({
  walletAddress: z.string().min(1),
  privyUserId: z.string().optional(),
  token: z.enum(['USDC', 'USDT']),
  tokenAmount: z.string().regex(/^\d+(\.\d+)?$/),
  phoneNumber: z.string().regex(/^0\d{10}$/, 'Invalid Nigerian phone number'),
  service: z.enum(['mtn_vtu', 'glo_vtu', 'airtel_vtu', '9mobile_vtu']),
  paymentTxHash: z.string().optional(),
  category: z.enum(['airtime', 'data_bundle', 'cable_tv', 'electricity', 'showmax', 'gaming']).optional().default('airtime'),
  networkChainId: z.number().optional(),
  serviceName: z.string().optional(),
  serviceAmount: z.number().optional(), // NGN amount for airtime (when user inputs NGN)
  reference: z.string().optional(), // Allow custom reference for testing
});

export async function POST(request: NextRequest) {
  let transaction: any = null;
  try {
    const body = await request.json();
    const validated = purchaseSchema.parse(body);

    // Normalize wallet address for consistent database storage
    const normalizedWalletAddress = normalizeWalletAddress(validated.walletAddress);
    if (!normalizedWalletAddress) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Verify payment transaction (you should implement proper verification)
    if (!validated.paymentTxHash) {
      return NextResponse.json(
        { error: 'Payment transaction hash is required' },
        { status: 400 }
      );
    }

    try {
      await verifyUtilityInboundPayment({
        paymentTxHash: validated.paymentTxHash,
        networkChainId: validated.networkChainId,
        token: validated.token as SupportedToken,
        tokenAmount: validated.tokenAmount,
        payerWalletAddress: normalizedWalletAddress,
      });
    } catch (verifyErr: any) {
      return NextResponse.json(
        { error: verifyErr?.message || 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Calculate exchange rate and NGN amount
    // If serviceAmount is provided (for airtime reverse calculator), use it as NGN amount
    // Otherwise, calculate from tokenAmount
    let exchangeRate: number;
    let ngnAmount: number;

    if (validated.serviceAmount && validated.serviceAmount > 0) {
      // For airtime reverse calculator: serviceAmount is NGN, calculate exchange rate
      ngnAmount = validated.serviceAmount;
      const parsedTokenAmount = parseFloat(validated.tokenAmount);
      if (!isFinite(parsedTokenAmount) || parsedTokenAmount <= 0) {
        return NextResponse.json(
          { error: 'Invalid token amount. Must be greater than zero.' },
          { status: 400 }
        );
      }
      exchangeRate = ngnAmount / parsedTokenAmount;
    } else {
      // Standard flow: calculate NGN from tokenAmount
      exchangeRate = await getExchangeRate(validated.token as SupportedToken);
      ngnAmount = parseFloat(validated.tokenAmount) * exchangeRate;
    }

    const roundedNgnAmount = Math.round(ngnAmount);

    // Check PayBeta wallet balance before processing
    try {
      const paybetaClient = getCryptobilzClient();
      const balanceResponse = await paybetaClient.getWalletBalance();

      if (balanceResponse.status !== 'successful' || !balanceResponse.data) {
        return NextResponse.json(
          {
            error: 'Failed to verify PayBeta wallet balance',
            details: balanceResponse.message || 'Unable to check balance',
          },
          { status: 503 }
        );
      }

      const availableBalance = balanceResponse.data.availableBalance;

      if (availableBalance < roundedNgnAmount) {
        return NextResponse.json(
          {
            error: 'PayBeta has insufficient balance to process this transaction',
            details: {
              required: roundedNgnAmount,
              available: availableBalance,
              shortfall: roundedNgnAmount - availableBalance,
            },
          },
          { status: 503 }
        );
      }
    } catch (balanceError: any) {
      console.error('Error checking PayBeta balance:', balanceError);
      return NextResponse.json(
        {
          error: 'Failed to verify PayBeta wallet balance',
          details: balanceError.message || 'Balance check failed',
        },
        { status: 503 }
      );
    }

    // Get network details if chainId provided
    const network = validated.networkChainId ? getNetworkById(validated.networkChainId) : null;

    // Get or create user
    // First try to find by wallet address (normalized)
    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedWalletAddress },
    });

    // If not found by wallet address, try to find by privyUserId (if provided)
    if (!user && validated.privyUserId) {
      user = await prisma.user.findUnique({
        where: { privyUserId: validated.privyUserId },
      });
      
      // If found by privyUserId but wallet address is different, update the wallet address
      if (user && user.walletAddress !== normalizedWalletAddress) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { walletAddress: normalizedWalletAddress },
        });
      }
    }

    // If still not found, create new user
    if (!user) {
      // Use upsert to handle race conditions where user might be created between checks
      // First try to find if user exists with privyUserId to avoid unique constraint violation
      if (validated.privyUserId) {
        const existingUserByPrivyId = await prisma.user.findUnique({
          where: { privyUserId: validated.privyUserId },
        });
        
        if (existingUserByPrivyId) {
          // User exists with this privyUserId, update wallet address
          user = await prisma.user.update({
            where: { id: existingUserByPrivyId.id },
            data: { walletAddress: normalizedWalletAddress },
          });
        } else {
          // No user exists, create new one
          user = await prisma.user.create({
            data: {
              walletAddress: normalizedWalletAddress,
              privyUserId: validated.privyUserId,
            },
          });
        }
      } else {
        // No privyUserId provided, just create with wallet address
        user = await prisma.user.create({
          data: {
            walletAddress: normalizedWalletAddress,
          },
        });
      }
    } else if (validated.privyUserId && !user.privyUserId) {
      // Update existing user with privyUserId if not already set
      user = await prisma.user.update({
        where: { id: user.id },
        data: { privyUserId: validated.privyUserId },
      });
    }

    // Generate unique reference (use custom reference if provided, otherwise generate one)
    const reference = validated.reference || `CRYPTOBILZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Determine service name from service code (for display)
    const serviceNameMap: Record<string, string> = {
      'mtn_vtu': 'MTN VTU',
      'glo_vtu': 'GLO VTU',
      'airtel_vtu': 'Airtel VTU',
      '9mobile_vtu': '9mobile VTU',
    };
    const serviceName = validated.serviceName || serviceNameMap[validated.service] || validated.service;

    // Create transaction record with all details
    // Use normalized wallet address for consistent database storage
    transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        walletAddress: normalizedWalletAddress,
        token: validated.token,
        tokenAmount: validated.tokenAmount,
        ngnAmount,
        exchangeRate,
        paymentTxHash: validated.paymentTxHash,
        networkChainId: network?.id,
        networkName: network?.name,
        category: validated.category || 'airtime',
        service: validated.service,
        serviceName,
        phoneNumber: validated.phoneNumber,
        serviceAmount: validated.serviceAmount || roundedNgnAmount, // Use serviceAmount if provided (airtime reverse calculator), otherwise rounded amount
        paybetaReference: reference,
        status: 'payment_received',
        paymentReceivedAt: new Date(),
      },
    });

    // Process payment via dynamic payment processor
    // This routes to the appropriate PayBeta API endpoint based on category
    let paymentResponse;
    try {
      paymentResponse = await processPayment({
        category: validated.category || 'airtime',
        service: validated.service,
        phoneNumber: validated.phoneNumber,
        accountNumber: undefined, // Add when implementing other categories
        meterNumber: undefined, // Add when implementing electricity
        decoderNumber: undefined, // Add when implementing cable TV
        amount: validated.serviceAmount || roundedNgnAmount, // Use serviceAmount (user's NGN input) if provided, otherwise rounded amount
        reference,
      });
    } catch (processError: any) {
      console.error('Error processing payment:', processError);
      await settleUtilityEscrowOnBillFailure(
        transaction.id,
        processError.message || 'Payment processing failed',
      );
      return NextResponse.json(
        { error: processError.message || 'Failed to process payment' },
        { status: 500 }
      );
    }

    // Update transaction with PayBeta response
    if (paymentResponse.status === 'successful' && paymentResponse.data) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'completed',
          paybetaTransactionId: paymentResponse.data?.transactionId,
          chargedAmount: paymentResponse.data?.chargedAmount || null,
          commission: paymentResponse.data?.commission || null,
          completedAt: new Date(),
        },
      });

      await settleUtilityEscrowOnBillSuccess(transaction.id);

      const categoryName = validated.category === 'airtime' ? 'airtime' : validated.category;

      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'completed',
          paybetaReference: paymentResponse.data?.reference || reference,
          paybetaTransactionId: paymentResponse.data?.transactionId,
        },
      });
    } else if (paymentResponse.status === 'pending' || paymentResponse.message?.toLowerCase().includes('pending')) {
      // Handle pending transactions - PayBeta is still processing
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'processing',
          paybetaTransactionId: paymentResponse.data?.transactionId || null,
          errorMessage: paymentResponse.message || 'Transaction is pending',
        },
      });

      const categoryName = validated.category === 'airtime' ? 'airtime' : validated.category;

      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'processing',
          paybetaReference: paymentResponse.data?.reference || reference,
          paybetaTransactionId: paymentResponse.data?.transactionId,
          message: paymentResponse.message || 'Transaction is being processed. Please check back later.',
        },
      });
    } else {
      await settleUtilityEscrowOnBillFailure(
        transaction.id,
        paymentResponse.message || 'PayBeta purchase failed',
      );

      const categoryName = validated.category === 'airtime' ? 'airtime' : validated.category;

      return NextResponse.json(
        { error: paymentResponse.message || `Failed to purchase ${categoryName}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Purchase error:', error);

    // Update transaction status to refund_pending if it was created (API error after payment)
    if (transaction) {
      try {
        await settleUtilityEscrowOnBillFailure(
          transaction.id,
          error.message ||
            'PayBeta API error: ' + (error.response?.data?.message || 'Unknown error'),
        );
      } catch (updateError) {
        console.error('Failed to settle escrow after purchase error:', updateError);
      }
    }

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

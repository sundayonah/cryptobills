import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getExchangeRate } from '@/lib/exchange';
import { getNetworkById } from '@/lib/networks';
import { processPayment } from '@/lib/payment-processors';
import { getCryptobilzClient } from '@/lib/paybeta';
import { normalizeWalletAddress, toFloatOrNull } from '@/lib/utils';
import {
  settleUtilityEscrowOnBillFailure,
  settleUtilityEscrowOnBillSuccess,
  verifyUtilityInboundPayment,
} from '@/lib/utility-escrow';
import type { SupportedToken } from '@/types';

const purchaseSchema = z.object({
  walletAddress: z.string().min(1),
  privyUserId: z.string().optional(),
  token: z.enum(['USDC', 'USDT']),
  tokenAmount: z.string().regex(/^\d+(\.\d+)?$/),
  service: z.string().min(1, 'Service is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  /** From validate; PayBeta may return "" — server falls back before calling purchase */
  customerName: z.string().optional().default(''),
  /** Minimum NGN from /gaming/validate — purchase amount must be >= this */
  minimumAmount: z.number().int().positive(),
  paymentTxHash: z.string().optional(),
  category: z.enum(['gaming']).optional().default('gaming'),
  networkChainId: z.number().optional(),
  serviceName: z.string().optional(),
  reference: z.string().optional(),
  serviceAmount: z.number().optional(),
});

export async function POST(request: NextRequest) {
  let transaction: { id: string } | null = null;
  let billPaymentSucceeded = false;
  try {
    const body = await request.json();
    const validated = purchaseSchema.parse(body);

    // PayBeta validate sometimes returns empty customerName; purchase API expects a string
    const customerNameForPayBeta =
      validated.customerName.trim() !== ''
        ? validated.customerName.trim()
        : validated.customerId.trim() || 'Customer';

    const normalizedWalletAddress = normalizeWalletAddress(validated.walletAddress);
    if (!normalizedWalletAddress) {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    if (!validated.paymentTxHash) {
      return NextResponse.json({ error: 'Payment transaction hash is required' }, { status: 400 });
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
        { status: 400 },
      );
    }

    let ngnAmount: number;
    let exchangeRate: number;

    if (validated.serviceAmount && validated.serviceAmount > 0) {
      ngnAmount = validated.serviceAmount;
      const parsedTokenAmount = parseFloat(validated.tokenAmount);
      if (!isFinite(parsedTokenAmount) || parsedTokenAmount <= 0) {
        return NextResponse.json({ error: 'Invalid token amount. Must be greater than zero.' }, { status: 400 });
      }
      exchangeRate = ngnAmount / parsedTokenAmount;
    } else {
      exchangeRate = await getExchangeRate(validated.token as SupportedToken);
      const parsedTokenAmount = parseFloat(validated.tokenAmount);
      if (!isFinite(parsedTokenAmount) || parsedTokenAmount <= 0) {
        return NextResponse.json({ error: 'Invalid token amount. Must be greater than zero.' }, { status: 400 });
      }
      ngnAmount = parsedTokenAmount * exchangeRate;
    }

    const roundedNgnAmount = Math.round(ngnAmount);

    if (roundedNgnAmount < validated.minimumAmount) {
      return NextResponse.json(
        {
          error: `Gaming top-up requires at least ₦${validated.minimumAmount.toLocaleString()} for this account. Your amount (₦${roundedNgnAmount.toLocaleString()}) is too low.`,
          details: {
            minimumAmount: validated.minimumAmount,
            providedAmount: roundedNgnAmount,
          },
        },
        { status: 400 }
      );
    }

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
    } catch (balanceError: unknown) {
      console.error('Error checking PayBeta balance:', balanceError);
      return NextResponse.json(
        {
          error: 'Failed to verify PayBeta wallet balance',
          details: balanceError instanceof Error ? balanceError.message : 'Balance check failed',
        },
        { status: 503 }
      );
    }

    const network = validated.networkChainId ? getNetworkById(validated.networkChainId) : null;

    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedWalletAddress },
    });

    if (!user && validated.privyUserId) {
      user = await prisma.user.findUnique({
        where: { privyUserId: validated.privyUserId },
      });

      if (user && user.walletAddress !== normalizedWalletAddress) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { walletAddress: normalizedWalletAddress },
        });
      }
    }

    if (!user) {
      if (validated.privyUserId) {
        const existingUserByPrivyId = await prisma.user.findUnique({
          where: { privyUserId: validated.privyUserId },
        });

        if (existingUserByPrivyId) {
          user = await prisma.user.update({
            where: { id: existingUserByPrivyId.id },
            data: { walletAddress: normalizedWalletAddress },
          });
        } else {
          user = await prisma.user.create({
            data: {
              walletAddress: normalizedWalletAddress,
              privyUserId: validated.privyUserId,
            },
          });
        }
      } else {
        user = await prisma.user.create({
          data: { walletAddress: normalizedWalletAddress },
        });
      }
    } else if (validated.privyUserId && !user.privyUserId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { privyUserId: validated.privyUserId },
      });
    }

    const reference =
      validated.reference || `CRYPTOBILZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const serviceName = validated.serviceName || validated.service;

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
        category: 'gaming',
        service: validated.service,
        serviceName,
        customerName: customerNameForPayBeta,
        customerId: validated.customerId,
        accountNumber: validated.customerId,
        serviceAmount: validated.serviceAmount || roundedNgnAmount,
        paybetaReference: reference,
        status: 'payment_received',
        paymentReceivedAt: new Date(),
      },
    });

    let paymentResponse;
    try {
      paymentResponse = await processPayment({
        category: 'gaming',
        service: validated.service,
        customerId: validated.customerId,
        customerName: customerNameForPayBeta,
        amount: roundedNgnAmount,
        reference,
      });
    } catch (processError: unknown) {
      console.error('Error processing gaming payment:', processError);
      await settleUtilityEscrowOnBillFailure(
        transaction.id,
        processError instanceof Error ? processError.message : 'Payment processing failed',
      );
      return NextResponse.json(
        { error: processError instanceof Error ? processError.message : 'Failed to process payment' },
        { status: 500 }
      );
    }

    if (paymentResponse.status === 'successful' && paymentResponse.data) {
      billPaymentSucceeded = true;
      try {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            paybetaTransactionId: paymentResponse.data?.transactionId,
            chargedAmount: toFloatOrNull(paymentResponse.data?.chargedAmount),
            commission: toFloatOrNull(paymentResponse.data?.commission),
            biller: paymentResponse.data?.biller ?? null,
            electricityToken:
              paymentResponse.data?.token != null ? String(paymentResponse.data.token) : null,
            electricityUnit:
              paymentResponse.data?.unit != null ? String(paymentResponse.data.unit) : null,
            bonusToken:
              paymentResponse.data?.bonusToken != null && paymentResponse.data.bonusToken !== ''
                ? String(paymentResponse.data.bonusToken)
                : null,
            completedAt: new Date(),
          },
        });
      } catch (dbErr) {
        console.error('Failed to update transaction after successful bill:', dbErr);
      }

      await settleUtilityEscrowOnBillSuccess(transaction.id);

      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'completed',
          paybetaReference: paymentResponse.data?.reference || reference,
          paybetaTransactionId: paymentResponse.data?.transactionId,
          amount: paymentResponse.data?.amount || roundedNgnAmount,
          chargedAmount: paymentResponse.data?.chargedAmount || roundedNgnAmount,
          commission: paymentResponse.data?.commission || 0,
          biller: paymentResponse.data?.biller || serviceName,
          customerId: paymentResponse.data?.customerId || validated.customerId,
          token: paymentResponse.data?.token,
          unit: paymentResponse.data?.unit,
          bonusToken: paymentResponse.data?.bonusToken || '',
          voucher: paymentResponse.data?.voucher,
          transactionDate: paymentResponse.data?.transactionDate || new Date().toLocaleString(),
        },
      });
    }

    if (paymentResponse.status === 'pending' || paymentResponse.message?.toLowerCase().includes('pending')) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'processing',
          paybetaTransactionId: paymentResponse.data?.transactionId || null,
          errorMessage: paymentResponse.message || 'Transaction is pending',
        },
      });

      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'processing',
          paybetaReference: paymentResponse.data?.reference || reference,
          paybetaTransactionId: paymentResponse.data?.transactionId,
          message: paymentResponse.message || 'Transaction is being processed.',
        },
      });
    }

    await settleUtilityEscrowOnBillFailure(
      transaction.id,
      paymentResponse.message || 'PayBeta purchase failed',
    );

    return NextResponse.json(
      { error: paymentResponse.message || 'Failed to purchase gaming top-up' },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.error('Gaming purchase error:', error);

    if (transaction && !billPaymentSucceeded) {
      try {
        await settleUtilityEscrowOnBillFailure(
          transaction.id,
          error instanceof Error ? error.message : 'Internal server error during payment processing',
        );
      } catch (e) {
        console.error('Escrow settlement after gaming purchase error failed:', e);
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

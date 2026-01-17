import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { convertToNGN } from '@/lib/exchange';
import config from '@/lib/config';
import { getNetworkById } from '@/lib/networks';
import { processPayment } from '@/lib/payment-processors';
import { getCryptobilzClient } from '@/lib/paybeta';
import type { SupportedToken, UtilityBillCategory } from '@/types';

const purchaseSchema = z.object({
    walletAddress: z.string().min(1),
    privyUserId: z.string().optional(),
    token: z.enum(['USDC', 'USDT']),
    tokenAmount: z.string().regex(/^\d+(\.\d+)?$/),
    meterNumber: z.string().min(1, 'Meter number is required'),
    meterType: z.enum(['prepaid', 'postpaid'], {
        errorMap: () => ({ message: 'Meter type must be prepaid or postpaid' }),
    }),
    service: z.string().min(1, 'Service is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    customerAddress: z.string().min(1, 'Customer address is required'),
    paymentTxHash: z.string().optional(),
    category: z.enum(['electricity']).optional().default('electricity'),
    networkChainId: z.number().optional(),
    serviceName: z.string().optional(),
    reference: z.string().optional(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validated = purchaseSchema.parse(body);

        // Verify payment transaction
        if (!validated.paymentTxHash) {
            return NextResponse.json(
                { error: 'Payment transaction hash is required' },
                { status: 400 }
            );
        }

        // Convert token amount to NGN
        const ngnAmount = await convertToNGN(validated.tokenAmount, validated.token as SupportedToken);
        const exchangeRate = ngnAmount / parseFloat(validated.tokenAmount);

        // Validate minimum amount for electricity (PayBeta requires minimum 1000 NGN)
        const ELECTRICITY_MIN_AMOUNT_NGN = 1000;
        const roundedNgnAmount = Math.round(ngnAmount);
        if (roundedNgnAmount < ELECTRICITY_MIN_AMOUNT_NGN) {
            return NextResponse.json(
                {
                    error: `Electricity purchases require a minimum of ₦${ELECTRICITY_MIN_AMOUNT_NGN.toLocaleString()}. Your amount (₦${roundedNgnAmount.toLocaleString()}) is too low.`,
                    details: {
                        minimumAmount: ELECTRICITY_MIN_AMOUNT_NGN,
                        providedAmount: roundedNgnAmount,
                    },
                },
                { status: 400 }
            );
        }

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
        const reference = validated.reference || `CRYPTOBILZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Get service name for display (use provider name if available)
        const serviceName = validated.serviceName || validated.service.replace(/-electric$/i, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

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
                networkChainId: network?.id,
                networkName: network?.name,
                category: 'electricity',
                service: validated.service,
                serviceName,
                meterNumber: validated.meterNumber,
                accountNumber: validated.meterNumber,
                meterType: validated.meterType,
                customerName: validated.customerName,
                customerAddress: validated.customerAddress,
                serviceAmount: roundedNgnAmount,
                paybetaReference: reference,
                status: 'payment_received',
                paymentReceivedAt: new Date(),
            },
        });

        // Process payment via dynamic payment processor
        const paymentResponse = await processPayment({
            category: 'electricity',
            service: validated.service,
            meterNumber: validated.meterNumber,
            meterType: validated.meterType,
            amount: roundedNgnAmount,
            customerName: validated.customerName,
            customerAddress: validated.customerAddress,
            reference,
        });

        // Update transaction with PayBeta response
        if (paymentResponse.status === 'successful' && paymentResponse.data) {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'completed',
                    paybetaTransactionId: paymentResponse.data?.transactionId,
                    chargedAmount: paymentResponse.data?.chargedAmount || null,
                    commission: paymentResponse.data?.commission || null,
                    // Convert to string if needed (electricityUnit, electricityToken, bonusToken are String? in schema)
                    electricityToken: paymentResponse.data?.token != null ? String(paymentResponse.data.token) : null,
                    electricityUnit: paymentResponse.data?.unit != null ? String(paymentResponse.data.unit) : null,
                    bonusToken: paymentResponse.data?.bonusToken != null && paymentResponse.data.bonusToken !== '' ? String(paymentResponse.data.bonusToken) : null,
                    biller: paymentResponse.data?.biller || null,
                    customerId: paymentResponse.data?.customerId || null,
                    completedAt: new Date(),
                },
            });

            return NextResponse.json({
                success: true,
                transaction: {
                    id: transaction.id,
                    status: 'completed',
                    paybetaReference: paymentResponse.data?.reference || reference,
                    paybetaTransactionId: paymentResponse.data?.transactionId,
                    token: paymentResponse.data?.token, // For prepaid meters
                    unit: paymentResponse.data?.unit, // Units purchased
                    // Include full PayBeta response data for receipt
                    amount: paymentResponse.data?.amount || roundedNgnAmount,
                    chargedAmount: paymentResponse.data?.chargedAmount || roundedNgnAmount,
                    commission: paymentResponse.data?.commission || 0,
                    biller: paymentResponse.data?.biller || serviceName,
                    customerId: paymentResponse.data?.customerId || validated.meterNumber,
                    bonusToken: paymentResponse.data?.bonusToken || "",
                    transactionDate: paymentResponse.data?.transactionDate || new Date().toLocaleString(),
                },
            });
        } else {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'failed',
                    errorMessage: paymentResponse.message || 'PayBeta purchase failed',
                },
            });

            return NextResponse.json(
                { error: paymentResponse.message || 'Failed to purchase electricity' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Electricity purchase error:', error);

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

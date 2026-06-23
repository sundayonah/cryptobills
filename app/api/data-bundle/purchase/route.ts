import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getExchangeRate } from '@/lib/exchange';
import config from '@/lib/config';
import { getNetworkById } from '@/lib/networks';
import { processPayment } from '@/lib/payment-processors';
import { normalizeWalletAddress, toFloatOrNull } from '@/lib/utils';
import {
    settleUtilityEscrowOnBillFailure,
    settleUtilityEscrowOnBillSuccess,
    verifyUtilityInboundPayment,
} from '@/lib/utility-escrow';
import type { SupportedToken, UtilityBillCategory, DataBundleService } from '@/types';

const purchaseSchema = z.object({
    walletAddress: z.string().min(1),
    privyUserId: z.string().optional(),
    token: z.enum(['USDC', 'USDT']),
    tokenAmount: z.string().regex(/^\d+(\.\d+)?$/),
    phoneNumber: z.string().regex(/^0\d{10}$/, 'Invalid Nigerian phone number'),
    service: z.enum(['mtn_data', 'glo_data', 'airtel_data', '9mobile_data']),
    code: z.string().min(1, 'Bundle code is required'), // Bundle code (e.g., "MTN_100_MB_DAILY_DATA_BUNDLE" or "MT1")
    paymentTxHash: z.string().optional(),
    category: z.enum(['data_bundle']).optional().default('data_bundle'),
    networkChainId: z.number().optional(),
    serviceName: z.string().optional(),
    reference: z.string().optional(), // Allow custom reference for testing
    serviceAmount: z.number().optional(), // Exact NGN price from bundle (for fixed-price bundles)
});

export async function POST(request: NextRequest) {
    let transaction: { id: string } | null = null;
    let billPaymentSucceeded = false;
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

        // If serviceAmount is provided (for bundles with fixed prices), use it directly
        // Otherwise, calculate from tokenAmount using current exchange rate
        let ngnAmount: number;
        let exchangeRate: number;

        if (validated.serviceAmount && validated.serviceAmount > 0) {
            // Use exact NGN amount from bundle price
            ngnAmount = validated.serviceAmount;
            // Calculate exchange rate backward for storage (exact rate used for this transaction)
            const parsedTokenAmount = parseFloat(validated.tokenAmount);
            if (!isFinite(parsedTokenAmount) || parsedTokenAmount <= 0) {
                return NextResponse.json(
                    { error: 'Invalid token amount. Must be greater than zero.' },
                    { status: 400 }
                );
            }
            exchangeRate = ngnAmount / parsedTokenAmount;
        } else {
            // Get exact exchange rate from API (for non-bundle purchases like airtime)
            exchangeRate = await getExchangeRate(validated.token as SupportedToken);
            // Calculate NGN amount using exact rate
            const parsedTokenAmount = parseFloat(validated.tokenAmount);
            if (!isFinite(parsedTokenAmount) || parsedTokenAmount <= 0) {
                return NextResponse.json(
                    { error: 'Invalid token amount. Must be greater than zero.' },
                    { status: 400 }
                );
            }
            ngnAmount = parsedTokenAmount * exchangeRate;
        }

        // Get network details if chainId provided
        const network = validated.networkChainId ? getNetworkById(validated.networkChainId) : null;

        // Get or create user
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
        const serviceNameMap: Record<DataBundleService, string> = {
            'mtn_data': 'MTN Data',
            'glo_data': 'GLO Data',
            'airtel_data': 'Airtel Data',
            '9mobile_data': '9mobile Data',
        };
        const serviceName = validated.serviceName || serviceNameMap[validated.service] || validated.service;

        // Create transaction record with all details
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
                category: 'data_bundle',
                service: validated.service,
                serviceName,
                bundleCode: validated.code, // Store bundle code for data bundle
                phoneNumber: validated.phoneNumber,
                serviceAmount: Math.round(ngnAmount), // Amount in NGN (integer)
                paybetaReference: reference,
                status: 'payment_received',
                paymentReceivedAt: new Date(),
            },
        });

        // Process payment via dynamic payment processor
        let paymentResponse;
        try {
            paymentResponse = await processPayment({
                category: 'data_bundle',
                service: validated.service,
                phoneNumber: validated.phoneNumber,
                code: validated.code, // Bundle code is required for data bundle
                amount: Math.round(ngnAmount), // Ensure integer
                reference,
            });
        } catch (processError: any) {
            console.error('Error processing data bundle payment:', processError);
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
            billPaymentSucceeded = true;
            try {
                await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'completed',
                        paybetaTransactionId: paymentResponse.data?.transactionId,
                        chargedAmount: toFloatOrNull(paymentResponse.data?.chargedAmount),
                        commission: toFloatOrNull(paymentResponse.data?.commission),
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

            return NextResponse.json(
                { error: paymentResponse.message || 'Failed to purchase data bundle' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Data bundle purchase error:', error);

        if (transaction && !billPaymentSucceeded) {
            try {
                await settleUtilityEscrowOnBillFailure(
                    transaction.id,
                    error.message || 'Internal server error during payment processing',
                );
            } catch (e) {
                console.error('Escrow settlement after data-bundle error failed:', e);
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

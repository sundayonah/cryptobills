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
    serviceAmount: z.number().optional(),
});

export async function POST(request: NextRequest) {
    let transaction: { id: string } | null = null;
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

        // Verify payment transaction
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
        // If serviceAmount is provided (for electricity reverse calculator), use it as NGN amount
        // Otherwise, calculate from tokenAmount
        let exchangeRate: number;
        let ngnAmount: number;

        if (validated.serviceAmount && validated.serviceAmount > 0) {
            // For electricity reverse calculator: serviceAmount is NGN, calculate exchange rate
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

        // Validate minimum amount for electricity (PayBeta requires minimum 1000 NGN)
        // Use serviceAmount if provided (from reverse calculator), otherwise use roundedNgnAmount
        const amountToValidate = validated.serviceAmount || roundedNgnAmount;
        const ELECTRICITY_MIN_AMOUNT_NGN = 1000;
        if (amountToValidate < ELECTRICITY_MIN_AMOUNT_NGN) {
            return NextResponse.json(
                {
                    error: `Electricity purchases require a minimum of ₦${ELECTRICITY_MIN_AMOUNT_NGN.toLocaleString()}. Your amount (₦${amountToValidate.toLocaleString()}) is too low.`,
                    details: {
                        minimumAmount: ELECTRICITY_MIN_AMOUNT_NGN,
                        providedAmount: amountToValidate,
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

        // Generate unique reference
        const reference = validated.reference || `CRYPTOBILZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Get service name for display (use provider name if available)
        const serviceName = validated.serviceName || validated.service.replace(/-electric$/i, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        // Create transaction record
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
                category: 'electricity',
                service: validated.service,
                serviceName,
                meterNumber: validated.meterNumber,
                accountNumber: validated.meterNumber,
                meterType: validated.meterType,
                customerName: validated.customerName,
                customerAddress: validated.customerAddress,
                serviceAmount: validated.serviceAmount || roundedNgnAmount,
                paybetaReference: reference,
                status: 'payment_received',
                paymentReceivedAt: new Date(),
            },
        });

        // Process payment via dynamic payment processor
        let paymentResponse;
        try {
            paymentResponse = await processPayment({
                category: 'electricity',
                service: validated.service,
                meterNumber: validated.meterNumber,
                meterType: validated.meterType,
                amount: validated.serviceAmount || roundedNgnAmount, // Use serviceAmount if provided (electricity reverse calculator), otherwise rounded amount
                customerName: validated.customerName,
                customerAddress: validated.customerAddress,
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
                    // Convert to string if needed (electricityUnit, electricityToken, bonusToken are String? in schema)
                    electricityToken: paymentResponse.data?.token != null ? String(paymentResponse.data.token) : null,
                    electricityUnit: paymentResponse.data?.unit != null ? String(paymentResponse.data.unit) : null,
                    bonusToken: paymentResponse.data?.bonusToken != null && paymentResponse.data.bonusToken !== '' ? String(paymentResponse.data.bonusToken) : null,
                    biller: paymentResponse.data?.biller || null,
                    customerId: paymentResponse.data?.customerId || null,
                    completedAt: new Date(),
                },
            });

            await settleUtilityEscrowOnBillSuccess(transaction.id);

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
                { error: paymentResponse.message || 'Failed to purchase electricity' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Electricity purchase error:', error);

        if (transaction) {
            try {
                await settleUtilityEscrowOnBillFailure(
                    transaction.id,
                    error.message || 'Internal server error during payment processing',
                );
            } catch (e) {
                console.error('Escrow settlement after electricity purchase error failed:', e);
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

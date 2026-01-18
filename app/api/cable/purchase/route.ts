import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getExchangeRate } from '@/lib/exchange';
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
    smartCardNumber: z.string().min(1, 'Smart card number is required'),
    service: z.string().min(1, 'Service is required'),
    packageCode: z.string().min(1, 'Package code is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    paymentTxHash: z.string().optional(),
    category: z.enum(['cable_tv']).optional().default('cable_tv'),
    networkChainId: z.number().optional(),
    serviceName: z.string().optional(),
    reference: z.string().optional(),
    serviceAmount: z.number().optional(), // Exact NGN price from package (for fixed-price packages)
});

export async function POST(request: NextRequest) {
    let transaction: any = null;
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

        // If serviceAmount is provided (for packages with fixed prices), use it directly
        // Otherwise, calculate from tokenAmount using current exchange rate
        let ngnAmount: number;
        let exchangeRate: number;

        if (validated.serviceAmount && validated.serviceAmount > 0) {
            // Use exact NGN amount from package price
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
            // Get exact exchange rate from API (for non-package purchases)
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
        const serviceName = validated.serviceName || validated.service.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        // Create transaction record
        transaction = await prisma.transaction.create({
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
                category: 'cable_tv',
                service: validated.service,
                serviceName,
                accountNumber: validated.smartCardNumber,
                decoderNumber: validated.smartCardNumber,
                bundleCode: validated.packageCode,
                customerName: validated.customerName,
                serviceAmount: roundedNgnAmount,
                paybetaReference: reference,
                status: 'payment_received',
                paymentReceivedAt: new Date(),
            },
        });

        // Process payment via dynamic payment processor
        let paymentResponse;
        try {
            paymentResponse = await processPayment({
                category: 'cable_tv',
                service: validated.service,
                smartCardNumber: validated.smartCardNumber,
                code: validated.packageCode,
                amount: roundedNgnAmount,
                customerName: validated.customerName,
                reference,
            });
        } catch (processError: any) {
            // If processPayment throws, mark transaction as failed
            console.error('Error processing payment:', processError);
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'failed',
                    errorMessage: processError.message || 'Payment processing failed',
                },
            });
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
                    // Include full PayBeta response data for receipt
                    amount: paymentResponse.data?.amount || roundedNgnAmount,
                    chargedAmount: paymentResponse.data?.chargedAmount || roundedNgnAmount,
                    commission: paymentResponse.data?.commission || 0,
                    biller: paymentResponse.data?.biller || serviceName,
                    customerId: paymentResponse.data?.customerId || validated.smartCardNumber,
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
            // Transaction failed
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'failed',
                    errorMessage: paymentResponse.message || 'PayBeta purchase failed',
                },
            });

            return NextResponse.json(
                { error: paymentResponse.message || 'Failed to purchase cable TV' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Cable TV purchase error:', error);

        // Update transaction status to failed if it was created
        if (transaction) {
            try {
                await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'failed',
                        errorMessage: error.message || 'Internal server error during payment processing',
                    },
                });
            } catch (updateError) {
                console.error('Failed to update transaction status:', updateError);
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

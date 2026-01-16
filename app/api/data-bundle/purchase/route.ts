import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { convertToNGN } from '@/lib/exchange';
import config from '@/lib/config';
import { getNetworkById } from '@/lib/networks';
import { processPayment } from '@/lib/payment-processors';
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
        // This routes to the appropriate PayBeta API endpoint based on category
        const paymentResponse = await processPayment({
            category: 'data_bundle',
            service: validated.service,
            phoneNumber: validated.phoneNumber,
            code: validated.code, // Bundle code is required for data bundle
            amount: Math.round(ngnAmount), // Ensure integer
            reference,
        });

        // Update transaction with PayBeta response
        if (paymentResponse.status === 'successful' && paymentResponse.data) {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'completed',
                    paybetaTransactionId: paymentResponse.data?.transactionId,
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
                { error: paymentResponse.message || 'Failed to purchase data bundle' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Data bundle purchase error:', error);

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

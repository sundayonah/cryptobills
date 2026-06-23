import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    isEscrowSettlementCategory,
    settleUtilityEscrowOnBillFailure,
    settleUtilityEscrowOnBillSuccess,
} from '@/lib/utility-escrow';
import {
    mapPaybetaTransactionToDbStatus,
    normalizePaybetaCode,
} from '@/lib/paybeta-transaction-status';
import { toFloatOrNull } from '@/lib/utils';

/**
 * PayBeta Webhook Endpoint
 * POST /api/tx/webhook
 * 
 * Receives real-time transaction status updates from PayBeta.
 * PayBeta will call this endpoint when transaction status changes.
 * 
 * Configure this URL in your PayBeta dashboard:
 * https://www.cryptobilz.xyz/api/tx/webhook
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate webhook payload structure
        if (!body.reference) {
            return NextResponse.json(
                { error: 'Missing reference in webhook payload' },
                { status: 400 }
            );
        }

        const { reference, code, status, message, data } = body;

        // Find transaction by PayBeta reference
        const transaction = await prisma.transaction.findUnique({
            where: { paybetaReference: reference },
        });

        if (!transaction) {
            // Transaction not found - log but return 200 to prevent PayBeta from retrying
            console.warn(`Webhook received for unknown transaction reference: ${reference}`);
            return NextResponse.json(
                { message: 'Transaction not found, but webhook received' },
                { status: 200 }
            );
        }

        const mapped = mapPaybetaTransactionToDbStatus({
            code,
            responseStatus: status,
            paymentStatus: data?.paymentStatus,
            message: message ?? null,
            currentDbStatus: transaction.status,
        });
        let dbStatus = mapped.status;
        let errorMessage = mapped.errorMessage;

        const knownCode = ['00', '01', '02', '99'].includes(normalizePaybetaCode(code));
        if (!knownCode) {
            dbStatus = transaction.status;
            errorMessage = message || mapped.errorMessage;
        }

        // Prepare update data
        const updateData: any = {
            status: dbStatus,
            errorMessage,
        };

        // Update PayBeta transaction ID if provided
        if (data?.transactionId) {
            updateData.paybetaTransactionId = data.transactionId;
        }

        // Update transaction-specific fields if available
        if (data) {
            // For electricity: update token, unit, biller, customerId
            if (transaction.category === 'electricity') {
                if (data.token && data.token !== '0') {
                    updateData.electricityToken = data.token;
                }
                if (data.unit && data.unit !== '0') {
                    updateData.electricityUnit = data.unit;
                }
            }

            // Update biller and customerId if available
            if (data.biller) {
                updateData.biller = data.biller;
            }
            if (data.customerId) {
                updateData.customerId = data.customerId;
            }

            // Update charged amount and commission if available
            if (data.amountPaid) {
                updateData.chargedAmount = toFloatOrNull(data.amountPaid);
            }
            if (data.commission !== undefined) {
                updateData.commission = toFloatOrNull(data.commission);
            }
        }

        // Set completedAt if status is 'completed'
        if (dbStatus === 'completed') {
            updateData.completedAt = new Date();
        }

        // Update transaction in database
        const updatedTransaction = await prisma.transaction.update({
            where: { id: transaction.id },
            data: updateData,
        });

        if (isEscrowSettlementCategory(transaction.category)) {
            if (dbStatus === 'completed') {
                await settleUtilityEscrowOnBillSuccess(updatedTransaction.id);
            }
            if (dbStatus === 'failed') {
                await settleUtilityEscrowOnBillFailure(
                    updatedTransaction.id,
                    errorMessage || 'PayBeta reported failure',
                );
            }
        }

        // Return 200 to acknowledge receipt (PayBeta expects 200 for successful webhook processing)
        return NextResponse.json({
            success: true,
            message: 'Webhook processed successfully',
            transactionId: updatedTransaction.id,
            status: updatedTransaction.status,
        });
    } catch (error: any) {
        console.error('Error processing PayBeta webhook:', error);

        // Return 500 so PayBeta knows to retry
        return NextResponse.json(
            {
                error: 'Failed to process webhook',
                details: error.message || 'Internal server error',
            },
            { status: 500 }
        );
    }
}

/**
 * GET endpoint for webhook verification (if PayBeta requires it)
 * Some webhook providers require GET endpoints for verification
 */
export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'PayBeta webhook endpoint is active',
        endpoint: '/api/tx/webhook',
        method: 'POST',
    });
}

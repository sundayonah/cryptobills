import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCryptobilzClient } from '@/lib/paybeta';
import type { TransactionQueryResponse } from '@/types';

/**
 * Sync transaction status with PayBeta
 * POST /api/transactions/[id]/sync-status
 * 
 * Queries PayBeta API for the latest transaction status and updates the database.
 * This is useful for handling stuck "processing" transactions.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const transactionId = params.id;

        // Get transaction from database
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
        });

        if (!transaction) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            );
        }

        // Check if transaction has a PayBeta reference
        if (!transaction.paybetaReference) {
            return NextResponse.json(
                { error: 'Transaction does not have a PayBeta reference. Cannot sync status.' },
                { status: 400 }
            );
        }

        // Query PayBeta for latest transaction status
        // Use client directly to get full response with code, status, message
        let paybetaResponse: TransactionQueryResponse;
        try {
            const client = getCryptobilzClient();
            paybetaResponse = await client.queryTransaction({
                reference: transaction.paybetaReference,
            });
        } catch (error: any) {
            return NextResponse.json(
                {
                    error: 'Failed to query PayBeta transaction status',
                    details: error.message || 'Unknown error',
                },
                { status: 500 }
            );
        }

        const paybetaData = paybetaResponse.data;

        // Map PayBeta status codes to our transaction status
        // PayBeta codes: '00' = successful, '01' = pending, '02' = failed, '99' = not found
        let status: string;
        let errorMessage: string | null = null;

        if (paybetaResponse.code === '00') {
            // Successful - check paymentStatus for more details
            if (paybetaData?.paymentStatus?.toLowerCase() === 'delivered') {
                status = 'completed';
            } else {
                status = 'processing'; // Still processing even if code is '00'
            }
        } else if (paybetaResponse.code === '01') {
            status = 'processing';
            errorMessage = paybetaResponse.message || 'Transaction is pending';
        } else if (paybetaResponse.code === '02') {
            status = 'failed';
            errorMessage = paybetaResponse.message || 'Transaction failed';
        } else if (paybetaResponse.code === '99') {
            status = 'failed';
            errorMessage = paybetaResponse.message || 'Transaction not found or invalid reference';
        } else {
            // Unknown code - keep current status but update error message
            status = transaction.status;
            errorMessage = paybetaResponse.message || 'Unknown transaction status';
        }

        // Prepare update data
        const updateData: any = {
            status,
            paybetaTransactionId: paybetaData?.transactionId || transaction.paybetaTransactionId,
            errorMessage,
        };

        // Update transaction-specific fields if available
        if (paybetaData) {
            // For electricity: update token, unit, biller, customerId
            if (transaction.category === 'electricity' && paybetaData.token && paybetaData.token !== '0') {
                updateData.electricityToken = paybetaData.token;
            }
            if (transaction.category === 'electricity' && paybetaData.unit && paybetaData.unit !== '0') {
                updateData.electricityUnit = paybetaData.unit;
            }
            // Note: biller may not be in TransactionQueryResponse data, only set if available
            if ('biller' in paybetaData && paybetaData.biller) {
                updateData.biller = paybetaData.biller as string;
            }
            if (paybetaData.customerId) {
                updateData.customerId = paybetaData.customerId;
            }

            // Update charged amount and commission if available
            if (paybetaData.amountPaid) {
                updateData.chargedAmount = paybetaData.amountPaid;
            }
        }

        // Set completedAt if status is 'completed'
        if (status === 'completed') {
            updateData.completedAt = new Date();
        }

        // Update transaction in database
        const updatedTransaction = await prisma.transaction.update({
            where: { id: transactionId },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            message: 'Transaction status synced successfully',
            transaction: {
                id: updatedTransaction.id,
                status: updatedTransaction.status,
                paybetaReference: updatedTransaction.paybetaReference,
                paybetaTransactionId: updatedTransaction.paybetaTransactionId,
                electricityToken: updatedTransaction.electricityToken,
                electricityUnit: updatedTransaction.electricityUnit,
                errorMessage: updatedTransaction.errorMessage,
                completedAt: updatedTransaction.completedAt,
            },
            paybetaResponse: {
                code: paybetaResponse.code,
                status: paybetaResponse.status,
                message: paybetaResponse.message,
                paymentStatus: paybetaData?.paymentStatus,
            },
        });
    } catch (error: any) {
        console.error('Error syncing transaction status:', error);

        return NextResponse.json(
            {
                error: 'Failed to sync transaction status',
                details: error.message || 'Internal server error',
            },
            { status: 500 }
        );
    }
}

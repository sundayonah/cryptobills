/**
 * Dynamic Payment Processor
 * Routes payment requests to category-specific PayBeta API endpoints
 */

import { getPayBetaClient } from './paybeta';
import type { UtilityBillCategory, AirtimeService } from '@/types';

// Base purchase request interface
export interface PurchaseRequest {
    category: UtilityBillCategory;
    phoneNumber?: string;
    accountNumber?: string;
    meterNumber?: string;
    decoderNumber?: string;
    service: string;
    amount: number;
    reference: string;
    // Additional fields that might be needed for specific categories
    bouquet?: string; // For Showmax
    smartCardNumber?: string; // For Cable TV
    customerName?: string; // For Electricity, Cable TV
}

// Purchase response interface
export interface PurchaseResponse {
    status: string;
    message: string;
    data?: {
        reference: string;
        transactionId?: string;
        amount?: number;
        [key: string]: any; // Allow additional fields from different categories
    };
}

/**
 * Purchase Airtime
 * POST /airtime/purchase
 */
async function purchaseAirtime(request: PurchaseRequest): Promise<PurchaseResponse> {
    const paybeta = getPayBetaClient();
    const response = await paybeta.purchaseAirtime({
        service: request.service as AirtimeService,
        phoneNumber: request.phoneNumber!,
        amount: request.amount,
        reference: request.reference,
    });
    return response;
}

/**
 * Purchase Data Bundle
 * POST /data-bundle/purchase
 */
async function purchaseDataBundle(request: PurchaseRequest): Promise<PurchaseResponse> {
    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post('/data-bundle/purchase', {
        service: request.service,
        phoneNumber: request.phoneNumber,
        amount: request.amount,
        reference: request.reference,
    });
    return response.data;
}

/**
 * Purchase Cable TV
 * POST /cable-tv/purchase
 */
async function purchaseCableTV(request: PurchaseRequest): Promise<PurchaseResponse> {
    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post('/cable-tv/purchase', {
        service: request.service,
        accountNumber: request.accountNumber,
        decoderNumber: request.decoderNumber || request.smartCardNumber,
        amount: request.amount,
        reference: request.reference,
        customerName: request.customerName,
    });
    return response.data;
}

/**
 * Purchase Electricity
 * POST /electricity/purchase
 */
async function purchaseElectricity(request: PurchaseRequest): Promise<PurchaseResponse> {
    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post('/electricity/purchase', {
        service: request.service,
        meterNumber: request.meterNumber,
        amount: request.amount,
        reference: request.reference,
        customerName: request.customerName,
    });
    return response.data;
}

/**
 * Purchase Showmax
 * POST /showmax/purchase
 */
async function purchaseShowmax(request: PurchaseRequest): Promise<PurchaseResponse> {
    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post('/showmax/purchase', {
        bouquet: request.bouquet || request.service, // Showmax uses 'bouquet'
        phoneNumber: request.phoneNumber,
        amount: request.amount,
        reference: request.reference,
    });
    return response.data;
}

/**
 * Purchase Gaming
 * POST /gaming/purchase
 */
async function purchaseGaming(request: PurchaseRequest): Promise<PurchaseResponse> {
    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post('/gaming/purchase', {
        service: request.service,
        accountNumber: request.accountNumber,
        amount: request.amount,
        reference: request.reference,
    });
    return response.data;
}

/**
 * Dynamic Payment Processor
 * Routes payment requests to the appropriate category-specific function
 */
export async function processPayment(request: PurchaseRequest): Promise<PurchaseResponse> {
    const processorMap: Record<UtilityBillCategory, (req: PurchaseRequest) => Promise<PurchaseResponse>> = {
        airtime: purchaseAirtime,
        data_bundle: purchaseDataBundle,
        cable_tv: purchaseCableTV,
        electricity: purchaseElectricity,
        showmax: purchaseShowmax,
        gaming: purchaseGaming,
    };

    const processor = processorMap[request.category];
    if (!processor) {
        throw new Error(`Unsupported category: ${request.category}`);
    }

    try {
        return await processor(request);
    } catch (error: any) {
        // Handle and re-throw with context
        const errorMessage = error.response?.data?.message || error.message || 'Payment processing failed';
        throw new Error(`Failed to process ${request.category} payment: ${errorMessage}`);
    }
}

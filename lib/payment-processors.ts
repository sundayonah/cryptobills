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
    meterType?: 'prepaid' | 'postpaid'; // For Electricity
    decoderNumber?: string;
    service: string;
    amount: number;
    reference: string;
    // Additional fields that might be needed for specific categories
    bouquet?: string; // For Showmax
    /** Gaming / betting wallet customer ID from validate response */
    customerId?: string;
    smartCardNumber?: string; // For Cable TV
    customerName?: string; // For Electricity, Cable TV
    customerAddress?: string; // For Electricity
    code?: string; // For Data Bundle (bundle code) and Cable TV (package code)
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
    if (!request.code) {
        throw new Error('Bundle code is required for data bundle purchase');
    }
    if (!request.phoneNumber) {
        throw new Error('Phone number is required for data bundle purchase');
    }

    const paybeta = getPayBetaClient();
    const response = await paybeta.api.post('/data-bundle/purchase', {
        service: request.service,
        phoneNumber: request.phoneNumber,
        amount: request.amount,
        code: request.code,
        reference: request.reference,
    });
    return response.data;
}

/**
 * Purchase Cable TV
 * POST /cable/purchase
 */
async function purchaseCableTV(request: PurchaseRequest): Promise<PurchaseResponse> {
    if (!request.smartCardNumber) {
        throw new Error('Smart card number is required for cable TV purchase');
    }
    if (!request.code) {
        throw new Error('Package code is required for cable TV purchase');
    }
    if (!request.customerName) {
        throw new Error('Customer name is required for cable TV purchase');
    }

    const paybeta = getPayBetaClient();

    // Ensure amount is an integer (PayBeta requires integer)
    const amountInteger = Math.round(request.amount);

    const requestBody = {
        service: request.service,
        smartCardNumber: request.smartCardNumber,
        amount: amountInteger,
        packageCode: request.code,
        customerName: request.customerName,
        reference: request.reference,
    };

    // Log request for debugging
    if (process.env.NODE_ENV === 'development') {
        console.log('[Cable TV Purchase] Request body:', JSON.stringify(requestBody, null, 2));
    }

    try {
        const response = await paybeta.api.post('/cable/purchase', requestBody);
        return response.data;
    } catch (error: any) {
        // Enhanced error logging
        if (error.response?.data?.data?.errors) {
            console.error('[Cable TV Purchase] PayBeta validation errors:', JSON.stringify(error.response.data.data.errors, null, 2));
        }
        throw error;
    }
}

/**
 * Purchase Electricity
 * POST /electricity/purchase
 */
async function purchaseElectricity(request: PurchaseRequest): Promise<PurchaseResponse> {
    if (!request.meterNumber) {
        throw new Error('Meter number is required for electricity purchase');
    }
    if (!request.meterType) {
        throw new Error('Meter type (prepaid/postpaid) is required for electricity purchase');
    }
    if (!request.customerName) {
        throw new Error('Customer name is required for electricity purchase');
    }
    if (!request.customerAddress) {
        throw new Error('Customer address is required for electricity purchase');
    }

    const paybeta = getPayBetaClient();

    // Ensure amount is an integer (PayBeta requires integer)
    const amountInteger = Math.round(request.amount);

    // Ensure meterType is lowercase (PayBeta expects 'prepaid' or 'postpaid')
    const meterTypeLower = request.meterType.toLowerCase();

    const requestBody = {
        service: request.service,
        meterNumber: request.meterNumber,
        meterType: meterTypeLower,
        amount: amountInteger,
        customerName: request.customerName,
        customerAddress: request.customerAddress,
        reference: request.reference,
    };

    // Log request for debugging
    if (process.env.NODE_ENV === 'development') {
        console.log('[Electricity Purchase] Request body:', JSON.stringify(requestBody, null, 2));
    }

    try {
        const response = await paybeta.api.post('/electricity/purchase', requestBody);
        return response.data;
    } catch (error: any) {
        // Enhanced error logging
        if (error.response?.data?.data?.errors) {
            console.error('[Electricity Purchase] PayBeta validation errors:', JSON.stringify(error.response.data.data.errors, null, 2));
        }
        throw error;
    }
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
 * Body: service, customerId, amount (integer NGN), customerName, reference
 */
async function purchaseGaming(request: PurchaseRequest): Promise<PurchaseResponse> {
    const customerId = request.customerId?.trim();
    if (!customerId) {
        throw new Error('Customer ID is required for gaming purchase');
    }
    const paybeta = getPayBetaClient();
    const amountInteger = Math.round(request.amount);
    const customerName =
        request.customerName?.trim() || customerId || 'Customer';

    const requestBody = {
        service: request.service,
        customerId,
        amount: amountInteger,
        customerName,
        reference: request.reference,
    };

    try {
        const response = await paybeta.api.post('/gaming/purchase', requestBody);
        return response.data;
    } catch (error: any) {
        const status = error.response?.status;
        const data = error.response?.data;
        const msg =
            (typeof data === 'object' && data?.message) ||
            (typeof data === 'string' ? data : null) ||
            error.message ||
            'Gaming purchase request failed';
        const errors = data?.data?.errors;
        const detail =
            errors != null
                ? ` ${typeof errors === 'object' ? JSON.stringify(errors) : String(errors)}`
                : '';
        if (process.env.NODE_ENV === 'development') {
            console.error('[Gaming Purchase] PayBeta error:', status, JSON.stringify(data ?? error.message, null, 2));
            console.error('[Gaming Purchase] Request body:', JSON.stringify(requestBody, null, 2));
        }
        throw new Error(`${msg}${detail}${status ? ` (HTTP ${status})` : ''}`);
    }
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
        transfer: async () => {
            // Transfer is handled client-side (direct ERC20); never routed here
            throw new Error('Transfer payments are processed on the client');
        },
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

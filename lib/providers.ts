/**
 * Provider utilities for mapping provider names to service codes
 */

import type { AirtimeProvider, AirtimeService } from '@/types';

/**
 * Map provider name to service code
 */
export function mapProviderNameToService(name: string): AirtimeService | null {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('mtn')) {
    return 'mtn_vtu';
  }
  if (nameLower.includes('glo')) {
    return 'glo_vtu';
  }
  if (nameLower.includes('airtel')) {
    return 'airtel_vtu';
  }
  if (nameLower.includes('9mobile') || nameLower.includes('9 mobile')) {
    return '9mobile_vtu';
  }

  return null;
}

/**
 * Filter and map providers to include service codes
 */
export function processProviders(providers: AirtimeProvider[]): Array<AirtimeProvider & { service: AirtimeService }> {
  return providers
    .filter(provider => {
      // Filter by category, and status if provided (API may not include status)
      if (provider.category !== 'airtime') return false;
      // If status is provided, it must be true; if not provided, include it anyway
      return provider.status !== false;
    })
    .map(provider => {
      // Use slug if available (from API), otherwise map from name
      let service: AirtimeService | null = null;

      if (provider.slug && ['mtn_vtu', 'glo_vtu', 'airtel_vtu', '9mobile_vtu'].includes(provider.slug)) {
        service = provider.slug as AirtimeService;
      } else {
        // Fallback to name mapping
        service = mapProviderNameToService(provider.name);
      }

      if (!service) {
        return null;
      }
      return { ...provider, service };
    })
    .filter((provider): provider is AirtimeProvider & { service: AirtimeService } => provider !== null);
}

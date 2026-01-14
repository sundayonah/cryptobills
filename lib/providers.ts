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
 * Fallback providers data (used when API is not available)
 */
export const FALLBACK_PROVIDERS: AirtimeProvider[] = [
  {
    name: "MTN VTU",
    category: "airtime",
    status: true,
    logo: "https://res.cloudinary.com/paybeta/image/upload/v1713709773/Provider/VTU/800px-New-mtn-logo_wpn9qq.jpg"
  },
  {
    name: "GLO VTU",
    category: "airtime",
    status: true,
    logo: "https://res.cloudinary.com/paybeta/image/upload/v1713709647/Provider/VTU/glo_fpaf7m.svg"
  },
  {
    name: "Airtel VTU",
    category: "airtime",
    status: true,
    logo: "https://res.cloudinary.com/paybeta/image/upload/v1713709747/Provider/VTU/airtel_qkjpk1.png"
  },
  {
    name: "9mobile VTU",
    category: "airtime",
    status: true,
    logo: "https://res.cloudinary.com/paybeta/image/upload/v1713709763/Provider/VTU/9mobile_iswfnh.svg"
  }
];

/**
 * Filter and map providers to include service codes
 */
export function processProviders(providers: AirtimeProvider[]): Array<AirtimeProvider & { service: AirtimeService }> {
  return providers
    .filter(provider => provider.status && provider.category === 'airtime')
    .map(provider => {
      const service = mapProviderNameToService(provider.name);
      if (!service) {
        return null;
      }
      return { ...provider, service };
    })
    .filter((provider): provider is AirtimeProvider & { service: AirtimeService } => provider !== null);
}

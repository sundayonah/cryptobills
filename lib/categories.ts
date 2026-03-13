/**
 * Utility Bill Categories Configuration
 */

import type { UtilityBillCategory } from '@/types';

export interface CategoryConfig {
  id: UtilityBillCategory;
  name: string;
  enabled: boolean;
  apiPath: string;
}

export const UTILITY_CATEGORIES: CategoryConfig[] = [
  {
    id: 'airtime',
    name: 'Airtime',
    enabled: true,
    apiPath: '/airtime',
  },
  {
    id: 'data_bundle',
    name: 'Data Bundle',
    enabled: true,
    apiPath: '/data-bundle',
  },
  {
    id: 'electricity',
    name: 'Electricity',
    enabled: true,
    apiPath: '/electricity',
  },
  {
    id: 'cable_tv',
    name: 'Cable TV',
    enabled: true,
    apiPath: '/cable',
  },
  {
    id: 'transfer',
    name: 'Transfer',
    enabled: true,
    apiPath: '/transfer',
  },
  {
    id: 'showmax',
    name: 'Showmax',
    enabled: false,
    apiPath: '/showmax',
  },
  {
    id: 'gaming',
    name: 'Gaming',
    enabled: false,
    apiPath: '/gaming',
  },
];

/**
 * Get category by ID
 */
export function getCategoryById(id: UtilityBillCategory): CategoryConfig | undefined {
  return UTILITY_CATEGORIES.find(cat => cat.id === id);
}

/**
 * Get enabled categories
 */
export function getEnabledCategories(): CategoryConfig[] {
  return UTILITY_CATEGORIES.filter(cat => cat.enabled);
}

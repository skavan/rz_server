/**
 * Auto-inject helper for tenant scoping fields
 * Automatically adds customerId/homeId based on table requirements
 */

import type { RequestScope } from './scope.js';

/**
 * Table scoping requirements
 */
export const TABLE_SCOPE = {
  // Customer-scoped only (no specific home)
  customers: { customerId: false, homeId: false },
  users: { customerId: true, homeId: false },
  categories: { customerId: true, homeId: false },
  brands: { customerId: true, homeId: false },
  vendors: { customerId: true, homeId: false },
  tags: { customerId: true, homeId: false },
  locationTypes: { customerId: true, homeId: false },
  skus: { customerId: true, homeId: false },
  reservations: { customerId: true, homeId: true },
  issues: { customerId: true, homeId: false },
  inventoryActionRequests: { customerId: true, homeId: false },
  comments: { customerId: true, homeId: false },
  
  // Home-scoped (implicitly customer-scoped via home)
  homes: { customerId: true, homeId: false }, // customerId required, homeId is the record being created
  products: { customerId: false, homeId: true }, // homeId required (customer inferred from home)
  locations: { customerId: false, homeId: true },
  inventoryItems: { customerId: true, homeId: true }, // Both required
  
  // Junction tables
  userHomeAccess: { customerId: false, homeId: false }, // References users/homes directly
  productComponents: { customerId: false, homeId: false }, // References products
  skuComponents: { customerId: false, homeId: false }, // References skus
} as const;

export type TableName = keyof typeof TABLE_SCOPE;

/**
 * Auto-inject scoping fields based on table requirements
 * 
 * @example
 * // For products table (needs homeId only)
 * const data = autoInjectScope('products', scope, { name: 'TV' });
 * // Returns: { name: 'TV', homeId: 1 }
 * 
 * // For inventory_items (needs both)
 * const data = autoInjectScope('inventoryItems', scope, { skuId: 5 });
 * // Returns: { skuId: 5, customerId: 1, homeId: 1 }
 */
export function autoInjectScope<T extends Record<string, any>>(
  table: TableName,
  scope: RequestScope,
  data: T
): T {
  const requirements = TABLE_SCOPE[table];
  const result = { ...data };
  
  // Auto-inject customerId if needed and not provided
  if (requirements.customerId && !('customerId' in result)) {
    (result as any).customerId = scope.customerId;
  }
  
  // Auto-inject homeId if needed and not provided
  if (requirements.homeId && !('homeId' in result)) {
    // Use first home from scope (or specific home from query/header)
    if (scope.homeIds.length > 0) {
      (result as any).homeId = scope.homeIds[0];
    } else {
      throw new Error(`${table} requires homeId but none available in scope`);
    }
  }
  
  // Validate provided values match scope (security check)
  if ('customerId' in result && result.customerId !== scope.customerId) {
    throw new Error(`Unauthorized: customerId mismatch (provided: ${result.customerId}, allowed: ${scope.customerId})`);
  }
  
  if ('homeId' in result && !scope.homeIds.includes(result.homeId)) {
    throw new Error(`Unauthorized: homeId ${result.homeId} not in allowed homes [${scope.homeIds.join(', ')}]`);
  }
  
  return result;
}

/**
 * Validate that provided scope fields match authenticated scope
 * Use this when client MUST provide the field but you want to validate it
 */
export function validateScope<T extends Record<string, any>>(
  scope: RequestScope,
  data: T
): void {
  if ('customerId' in data && data.customerId !== scope.customerId) {
    throw new Error(`Unauthorized: customerId mismatch`);
  }
  
  if ('homeId' in data && !scope.homeIds.includes(data.homeId)) {
    throw new Error(`Unauthorized: homeId not accessible`);
  }
}

/**
 * Get default homeId from scope (first available home)
 * Useful when you need a single homeId but client didn't specify
 */
export function getDefaultHomeId(scope: RequestScope): number {
  if (scope.homeIds.length === 0) {
    throw new Error('No accessible homes in scope');
  }
  return scope.homeIds[0];
}

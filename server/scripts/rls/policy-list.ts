/**
 * RLS Policy Files List
 * 
 * Defines which policy files to apply and in what order.
 * Add new tables here as you create them.
 */

export const POLICY_FILES = [
  'categories.sql',
  'products.sql',
  'skus.sql', 
  'locations.sql',
  'inventory_items.sql'
] as const;

export type PolicyFile = typeof POLICY_FILES[number];

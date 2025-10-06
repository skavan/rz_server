/**
 * Standardized Field Set Keys
 * Use these consistent keys across all tables for maintainable API field selection
 */

// ============================================
// UNIVERSAL FIELD SET KEYS
// ============================================

/**
 * Size-based field sets (universal across all tables)
 */
export const UNIVERSAL_FIELD_SETS = {
  // Size-based - progressive disclosure
  minimal: 'Just ID and basic identification (name/title)',
  lite: 'Essential fields for lists and basic display',
  default: 'Standard API response with commonly needed fields',
  full: 'All fields including timestamps and metadata',
  
  // Context-based - UI component focused
  list: 'Optimized for table/grid views with sort/filter info',
  card: 'Perfect for card components with visual elements',
  detail: 'Complete information for detail/view pages',
  form: 'Fields needed for edit forms and data entry',
  
  // Role-based - access control focused
  admin: 'Administrative view with audit trails and metadata',
  public: 'Safe for public exposure, minimal identifying info'
} as const;

/**
 * Usage examples:
 * 
 * GET /api/customers?fields=lite
 * GET /api/users?fields=lite
 * GET /api/products?fields=lite
 * 
 * GET /api/customers?fields=admin
 * GET /api/users?fields=admin
 * 
 * All APIs use the same field set keys for consistency
 */

// ============================================
// FIELD SET VALIDATION
// ============================================

export type StandardFieldSetKey = keyof typeof UNIVERSAL_FIELD_SETS;

export const STANDARD_FIELD_SET_KEYS: StandardFieldSetKey[] = [
  'minimal',
  'lite', 
  'default',
  'full',
  'list',
  'card',
  'detail', 
  'form',
  'admin',
  'public'
];

/**
 * Validate if a field set key follows the standard
 */
export function isStandardFieldSetKey(key: string): key is StandardFieldSetKey {
  return STANDARD_FIELD_SET_KEYS.includes(key as StandardFieldSetKey);
}

// ============================================
// TYPE HELPERS FOR FIELD SETS
// ============================================

/**
 * Generic type for any table's field sets
 */
export type TableFieldSets<TTable> = {
  readonly minimal: readonly (keyof TTable)[];
  readonly lite: readonly (keyof TTable)[];
  readonly default: readonly (keyof TTable)[];
  readonly full: readonly (keyof TTable)[];
  readonly list: readonly (keyof TTable)[];
  readonly card: readonly (keyof TTable)[];
  readonly detail: readonly (keyof TTable)[];
  readonly form: readonly (keyof TTable)[];
  readonly admin: readonly (keyof TTable)[];
  readonly public: readonly (keyof TTable)[];
};

/**
 * Helper to create field set types for any table
 */
export type FieldSetTypes<TTable, TFieldSets extends TableFieldSets<TTable>> = {
  minimal: Pick<TTable, TFieldSets['minimal'][number]>;
  lite: Pick<TTable, TFieldSets['lite'][number]>;
  default: Pick<TTable, TFieldSets['default'][number]>;
  full: Pick<TTable, TFieldSets['full'][number]>;
  list: Pick<TTable, TFieldSets['list'][number]>;
  card: Pick<TTable, TFieldSets['card'][number]>;
  detail: Pick<TTable, TFieldSets['detail'][number]>;
  form: Pick<TTable, TFieldSets['form'][number]>;
  admin: Pick<TTable, TFieldSets['admin'][number]>;
  public: Pick<TTable, TFieldSets['public'][number]>;
};

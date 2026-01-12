/**
 * Field Transformation Utility
 * 
 * Extracts field mappings from Drizzle schemas and transforms raw SQL results
 * to match Drizzle's camelCase naming convention.
 */

import * as schemas from '@postgress/shared';

// Cache for field mappings to avoid repeated computation
const fieldMappingCache = new Map<string, Record<string, string>>();

// Basic snake_case -> camelCase converter as a safe fallback
function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Debug logging for fallback usage (logs once per table+field)
const fallbackLogged = new Set<string>();
const shouldDebug = (process.env.FIELD_TRANSFORM_DEBUG || '').toLowerCase() === 'true';
function logCamelCaseFallback(table: string | undefined, dbField: string, mapped: string | undefined, out: string, reason: 'missing-mapping' | 'snake-mapped') {
  if (!shouldDebug) return;
  const key = `${table || 'unknown'}:${dbField}`;
  if (fallbackLogged.has(key)) return;
  // eslint-disable-next-line no-console
  console.warn(`[FieldTransform] camelCase fallback applied for ${key} -> ${out} (${reason}${mapped ? `; mapped=${mapped}` : ''})`);
  fallbackLogged.add(key);
}

/**
 * Extract field mappings from a Drizzle table schema
 * Maps snake_case database field names to camelCase TypeScript property names
 */
function extractFieldMapping(schema: any): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  if (!schema) {
    return mapping;
  }

  // Get columns from the Symbol-based storage
  const columns = (schema as any)[Symbol.for('drizzle:Columns')];
  if (!columns) {
    return mapping;
  }

  // Iterate through all columns in the schema
  for (const [propertyName, column] of Object.entries(columns)) {
    const dbFieldName = (column as any).name; // Database field name (snake_case)
    mapping[dbFieldName] = propertyName; // TypeScript property name (camelCase)
  }

  return mapping;
}

/**
 * Get field mapping for a specific table
 * Uses caching to avoid repeated schema parsing
 * @param tableNameOrExport - Either the database table name (snake_case) or the schema export name (camelCase)
 */
export function getTableFieldMapping(tableNameOrExport: string): Record<string, string> {
  // Check cache first
  if (fieldMappingCache.has(tableNameOrExport)) {
    return fieldMappingCache.get(tableNameOrExport)!;
  }

  // Try to get schema directly by export name first
  let schema = (schemas as any)[tableNameOrExport];
  let cacheKey = tableNameOrExport;
  
  if (!schema || !schema.constructor || schema.constructor.name !== 'PgTable') {
    // If not found by export name, try to find by database table name
    // Look through all schemas to find one with matching database table name
    for (const [exportName, schemaObject] of Object.entries(schemas)) {
      if (schemaObject && 
          typeof schemaObject === 'object' && 
          schemaObject.constructor && 
          schemaObject.constructor.name === 'PgTable') {
        
        const dbTableName = (schemaObject as any)[Symbol.for('drizzle:Name')] || (schemaObject as any)[Symbol.for('drizzle:OriginalName')];
        if (dbTableName === tableNameOrExport) {
          schema = schemaObject;
          cacheKey = exportName; // Cache by export name for consistency
          break;
        }
      }
    }
  }
  
  if (!schema || !schema.constructor || schema.constructor.name !== 'PgTable') {
    fieldMappingCache.set(cacheKey, {});
    return {};
  }

  // Extract mapping
  const mapping = extractFieldMapping(schema);
  
  // Cache the result
  fieldMappingCache.set(cacheKey, mapping);
  
  return mapping;
}

/**
 * Transform a single database row from snake_case to camelCase
 */
export function transformRow(row: Record<string, any>, fieldMapping: Record<string, string>): Record<string, any> {
  const transformed: Record<string, any> = {};
  
  for (const [dbField, value] of Object.entries(row)) {
    // Use mapped field name if available, otherwise keep original
  const mapped = fieldMapping[dbField];
  // If mapping yields snake_case (some schemas use snake in code), force camelCase per API contract
  const clientField = mapped && !mapped.includes('_') ? mapped : toCamelCase(dbField);
    transformed[clientField] = value;
  }
  
  return transformed;
}

/**
 * Transform an array of database rows from snake_case to camelCase
 */
export function transformRows(rows: Record<string, any>[], tableName: string): Record<string, any>[] {
  const fieldMapping = getTableFieldMapping(tableName);
  return rows.map(row => {
    const transformed: Record<string, any> = {};
    for (const [dbField, value] of Object.entries(row)) {
      const clientSnake = dbField;
      const cleanField = clientSnake;
      const mapped = fieldMapping[cleanField];
      if (mapped && !mapped.includes('_')) {
        transformed[mapped] = value;
      } else {
        const out = toCamelCase(cleanField);
        transformed[out] = value;
        logCamelCaseFallback(tableName, cleanField, mapped, out, mapped ? 'snake-mapped' : 'missing-mapping');
      }
    }
    return transformed;
  });
}

/**
 * Transform raw SQL results that may contain data from multiple tables
 * Attempts to match fields to known table schemas
 */
export function transformMixedResults(rows: Record<string, any>[], primaryTable?: string): Record<string, any>[] {
  if (!rows.length) return rows;

  // If we have a primary table, use its mapping as the base
  let baseMapping: Record<string, string> = {};
  if (primaryTable) {
    baseMapping = getTableFieldMapping(primaryTable);
  }

  // For mixed results, we'll need a more sophisticated approach
  // For now, try to detect table prefixes in field names (e.g., "p.name" → "name")
  return rows.map(row => {
    const transformed: Record<string, any> = {};
    
    for (const [dbField, value] of Object.entries(row)) {
      // Remove table prefixes if present (e.g., "p.name" → "name")
      const cleanField = dbField.includes('.') ? dbField.split('.').pop()! : dbField;
      
      // Try to map using base mapping first
      const mapped = baseMapping[cleanField] || baseMapping[dbField];
      if (mapped && !mapped.includes('_')) {
        transformed[mapped] = value;
      } else {
        const out = toCamelCase(cleanField);
        transformed[out] = value;
        logCamelCaseFallback(primaryTable, cleanField, mapped, out, mapped ? 'snake-mapped' : 'missing-mapping');
      }
    }
    
    return transformed;
  });
}

/**
 * Get all available table mappings for debugging
 */
export function getAllTableMappings(): Record<string, Record<string, string>> {
  const allMappings: Record<string, Record<string, string>> = {};
  
  for (const [exportName, schemaObject] of Object.entries(schemas)) {
    // Filter for PgTable objects only (skip functions like 'and', 'eq', etc.)
    if (schemaObject && 
        typeof schemaObject === 'object' && 
        schemaObject.constructor && 
        schemaObject.constructor.name === 'PgTable') {
      
      allMappings[exportName] = getTableFieldMapping(exportName);
    }
  }
  
  return allMappings;
}

/**
 * Clear the field mapping cache (useful for development)
 */
export function clearMappingCache(): void {
  fieldMappingCache.clear();
}

/**
 * Log field mappings for debugging
 */
export function logTableMapping(tableName: string): void {
  const mapping = getTableFieldMapping(tableName);
  console.log(`Field mapping for table '${tableName}':`, mapping);
}

/**
 * Known DATE-only fields (not TIMESTAMPTZ).
 * These need to be normalized to midday UTC on response to prevent timezone shift.
 */
const DATE_ONLY_FIELDS = new Set([
  'etaDate',
  'eta_date',
  'purchaseDate',
  'purchase_date',
  'warrantyExpires',
  'warranty_expires',
  'expectedReplacement',
  'expected_replacement',
  'reviewedDate',
  'reviewed_date',
]);

/**
 * Normalize DATE-only fields to midday UTC for consistent client rendering.
 * Converts "2026-01-12" to "2026-01-12T12:00:00.000Z"
 * 
 * Use on response data before sending to client.
 */
export function normalizeDateOnlyFields<T extends Record<string, any>>(row: T): T {
  const result = { ...row };
  for (const key of Object.keys(result)) {
    if (DATE_ONLY_FIELDS.has(key) && result[key] != null) {
      const value = result[key];
      // If it's a string like "2026-01-12" (no time component)
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        result[key] = `${value}T12:00:00.000Z`;
      }
      // If it's a Date object, extract date and add midday UTC
      else if (value instanceof Date) {
        const dateStr = value.toISOString().split('T')[0];
        result[key] = `${dateStr}T12:00:00.000Z`;
      }
    }
  }
  return result;
}

/**
 * Normalize DATE-only fields for an array of rows.
 */
export function normalizeDateOnlyFieldsArray<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(normalizeDateOnlyFields);
}

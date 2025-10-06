// Client-safe exports - no server dependencies
export * from './schema.js';
export * from './zod.js';
export * from './types/index.js';

// Re-export ONLY client-safe Drizzle operators (no database functions)
export { eq, ne, gt, gte, lt, lte, isNull, isNotNull, inArray, notInArray, exists, notExists, between, notBetween, like, ilike, not, and, or, sql } from 'drizzle-orm';
export { asc, desc } from 'drizzle-orm';

import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { sql } from '@skavan/rentalzen-drizzle';
import { optionalAuth } from '../auth/index.js';
import { transformRows } from '../utils/field-transformer.js';
import { getRequestScope } from '../utils/scope.js';
import { getTablePolicy } from '../utils/policy-registry.js';
import { ENV_DEFAULT_LIMIT } from './shared/validation.js';

const router = Router();

const RESERVED_TABLES = new Set([
  'auth',
  'products',
  'skus',
  'inventory-items',
  'inventory_items',
  'locations',
  'location-types',
  'location_types',
  'categories',
  'brands',
  'vendors',
  'homes',
  'tags',
  'location-types',
  'location_types',
  'reservations',
  'reservations-v1',
  'crm',
  'booking',
  'finance',
  'crm-contacts',
  'crm_contacts',
  'crm-lead-sources',
  'crm_lead_sources',
  'booking-reservations',
  'booking_reservations',
  'booking-financials',
  'booking_financials',
  'booking-notes',
  'booking_notes',
  'finance-commissions',
  'finance_commissions',
  'table',
  'table-raw',
  'table_raw',
  'dbTable',
  'events',
  'media',
  'issues'
]);

const normalizeTableName = (raw: string): string => {
  return raw.replace(/-/g, '_');
};

router.get('/:tableName', optionalAuth, async (req, res, next) => {
  try {
    const enforce = process.env.ENFORCE_AUTH === 'true' || process.env.NODE_ENV === 'production';
    if (enforce && !(req as any).user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { tableName } = req.params;
    const normalized = normalizeTableName(tableName);

    if (RESERVED_TABLES.has(tableName) || RESERVED_TABLES.has(normalized)) {
      return next();
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const tableExists = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ${normalized}
    `);

    if (tableExists.rows.length === 0) {
      return res.status(404).json({ error: `Table '${normalized}' not found` });
    }

    const scope = await getRequestScope(req as any);
    const policy = await getTablePolicy(normalized);
    const hasHomes = Array.isArray(scope.homeIds) && scope.homeIds.length > 0;
    const allowNullHomeId = normalized === 'media_assets';

    let whereClause = sql``;
    if (policy.hasCustomerId && policy.hasHomeId && hasHomes) {
      const homesArray = sql.raw(`ARRAY[${scope.homeIds!.map((n) => Number(n)).filter((n) => Number.isFinite(n)).join(',')}]`);
      whereClause = allowNullHomeId
        ? sql`WHERE customer_id = ${scope.customerId} AND (home_id IS NULL OR home_id = ANY(${homesArray}))`
        : sql`WHERE customer_id = ${scope.customerId} AND home_id = ANY(${homesArray})`;
    } else if (policy.hasCustomerId) {
      whereClause = sql`WHERE customer_id = ${scope.customerId}`;
    } else if (policy.hasHomeId && hasHomes) {
      const homesArray = sql.raw(`ARRAY[${scope.homeIds!.map((n) => Number(n)).filter((n) => Number.isFinite(n)).join(',')}]`);
      whereClause = sql`WHERE home_id = ANY(${homesArray})`;
    }

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.execute(sql`
        SELECT * FROM ${sql.identifier(normalized)}
        ${whereClause}
        LIMIT ${sql.raw(String(ENV_DEFAULT_LIMIT))}
      `);
    });

    const transformedData = transformRows(results.rows, normalized);

    res.json({
      table: normalized,
      data: transformedData,
      count: transformedData.length,
    });
  } catch (error: any) {
    if (error?.status === 401) return next(error);
    console.error(`❌ Table fallback error for ${req.params.tableName}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

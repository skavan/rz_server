import { db } from "../db/index.js";
import { sql } from "@skavan/rentalzen-drizzle";

export type TablePolicy = {
  hasCustomerId?: boolean;
  hasHomeId?: boolean;
};

// In-memory dynamic registry built from database schema
const REGISTRY: Record<string, TablePolicy> = {};

// Optional static overrides (rare exceptions). Keep minimal to avoid manual errors.
const STATIC_OVERRIDES: Record<string, Partial<TablePolicy>> = {
  // example: 'some_table': { hasHomeId: false }
};

function applyOverrides(table: string, policy: TablePolicy): TablePolicy {
  const o = STATIC_OVERRIDES[table];
  return o ? { ...policy, ...o } : policy;
}

export async function initPolicyRegistry(): Promise<void> {
  // Build policies for all public tables from information_schema
  const result = await db.execute(sql`
    SELECT table_name,
           bool_or(column_name = 'customer_id') AS has_customer_id,
           bool_or(column_name = 'home_id')     AS has_home_id
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT LIKE 'pg_%'
      AND table_name NOT LIKE 'sql_%'
      AND table_name NOT LIKE '_drizzle_%'
    GROUP BY table_name
  `);

  for (const row of result.rows as any[]) {
    const table = row.table_name as string;
    const policy: TablePolicy = applyOverrides(table, {
      hasCustomerId: !!row.has_customer_id,
      hasHomeId: !!row.has_home_id,
    });
    REGISTRY[table] = policy;
  }
}

export function clearPolicyRegistry() {
  for (const k of Object.keys(REGISTRY)) delete REGISTRY[k];
}

async function ensureTablePolicy(table: string): Promise<TablePolicy> {
  if (REGISTRY[table]) return REGISTRY[table];
  // Query specific table columns if not already cached
  const res = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `);
  const cols = new Set((res.rows as any[]).map((r: any) => r.column_name));
  const policy = applyOverrides(table, {
    hasCustomerId: cols.has('customer_id'),
    hasHomeId: cols.has('home_id'),
  });
  REGISTRY[table] = policy;
  return policy;
}

export async function getTablePolicy(table: string): Promise<TablePolicy> {
  // Lazy init: if registry is empty, initialize for all tables
  if (Object.keys(REGISTRY).length === 0) {
    try {
      await initPolicyRegistry();
    } catch {
      // Fallback to per-table ensure if global init fails
    }
  }
  return ensureTablePolicy(table);
}

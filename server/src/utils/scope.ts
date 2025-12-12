import type { Request } from 'express';
import { db } from '../db/index.js';
import { sql } from '@postgress/shared';

export type HomeAccessRole = 'admin' | 'manager' | 'viewer';

export type RequestScope = {
  customerId: number;
  homeIds: number[]; // always concrete list on return
  homeAccessRole: HomeAccessRole; // highest role across all accessible homes
};

const ROLE_PRIORITY: Record<HomeAccessRole, number> = { admin: 3, manager: 2, viewer: 1 };

function getHighestRole(roles: string[]): HomeAccessRole {
  let highest: HomeAccessRole = 'viewer';
  for (const role of roles) {
    const r = role as HomeAccessRole;
    if (ROLE_PRIORITY[r] > ROLE_PRIORITY[highest]) {
      highest = r;
    }
  }
  return highest;
}

async function fetchUserScope(userId: number): Promise<{ customerId?: number; homeIds: number[]; homeAccessRole: HomeAccessRole }> {
  // Get user's customer_id
  const userRes = await db.execute(sql`SELECT customer_id FROM users WHERE id = ${userId} LIMIT 1`);
  const rawUserRow: any = (userRes.rows as any[])[0];
  const customerId: number | undefined = rawUserRow && rawUserRow.customer_id != null ? Number(rawUserRow.customer_id) : undefined;

  // Get homes user has access to with their roles
  const homesRes = await db.execute(sql`SELECT home_id, role FROM user_home_access WHERE user_id = ${userId}`);
  const rows = homesRes.rows as any[];
  const homeIds: number[] = rows.map((r) => Number(r.home_id)).filter((n) => Number.isFinite(n));
  const roles: string[] = rows.map((r) => r.role).filter(Boolean);
  const homeAccessRole = getHighestRole(roles);
  return { customerId, homeIds, homeAccessRole };
}

async function fetchDefaultHomeIds(customerId: number): Promise<number[]> {
  try {
    const res = await db.execute(sql`SELECT id FROM homes WHERE customer_id = ${customerId} ORDER BY id LIMIT 1`);
    const id = res.rows[0]?.id ? Number(res.rows[0].id) : undefined;
    return typeof id === 'number' && Number.isFinite(id) ? [id] : [];
  } catch (err) {
    console.warn('[scope] failed to fetch default homes; falling back to empty list', {
      customerId,
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

// Authoritative scope resolver: derives scope from auth and DB. Headers only in dev.
export async function getRequestScope(req: Request): Promise<RequestScope> {
  const isProd = process.env.NODE_ENV === 'production';
  const query = req.query as Record<string, any> | undefined;

  const queryValue = (...keys: string[]) => {
    if (!query) return undefined;
    for (const key of keys) {
      if (key in query) return query[key];
    }
    return undefined;
  };

  const parseNumberList = (value: any): number[] => {
    if (Array.isArray(value)) {
      return value
        .map((v) => Number(String(v).trim()))
        .filter((n) => Number.isFinite(n));
    }
    if (value == null) return [];
    return String(value)
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n));
  };

  // Helper to parse single requested home from query/header
  const parseRequestedHomeId = (): number | null => {
    const q = queryValue('homeId', 'home_id', 'HomeId');
    const h = req.header('x-home-id') || req.header('X-Home-Id');
    const raw = (Array.isArray(q) ? q[0] : q) ?? h;
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  // Helper to parse multi-home selection (query ?homeIds=1,2,3)
  const parseRequestedHomeIds = (): number[] => {
    const raw = queryValue('homeIds', 'home_ids', 'HomeIds');
    if (raw === undefined) return [];
    return parseNumberList(raw);
  };

  // If authenticated, derive from DB and validate selected home
  const authUser: any = (req as any).user;
  if (authUser?.id) {
    const { customerId, homeIds, homeAccessRole } = await fetchUserScope(Number(authUser.id));
    if (!customerId) {
      // No customer association; deny in prod, fallback to dev defaults otherwise
      if (isProd) throw new Error('Unauthorized: no customer association');
      return { customerId: 1, homeIds: await fetchDefaultHomeIds(1), homeAccessRole: 'admin' };
    }
    const allowed = homeIds.length > 0 ? homeIds : await fetchDefaultHomeIds(customerId);
    const multiRequested = parseRequestedHomeIds().filter((id) => allowed.includes(id));
    const requested = parseRequestedHomeId();
    const effective = multiRequested.length > 0
      ? multiRequested
      : requested && allowed.includes(requested)
        ? [requested]
        : allowed;
    return { customerId, homeIds: effective, homeAccessRole };
  }

  // No auth token: allow dev header overrides only when not in production
  if (!isProd) {
    const hdrCustomer = req.header('x-customer-id');
    const hdrHomes = req.header('x-home-ids');
    const singleHome = parseRequestedHomeId();
    const multiQueryHomes = parseRequestedHomeIds();

    const customerId = hdrCustomer ? parseInt(hdrCustomer, 10) : 1; // dev default
    // If x-home-ids present, use it; else if single selected present (query/header), use that; else default homes
    let homeIds: number[];
    if (hdrHomes) {
      homeIds = hdrHomes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => parseInt(n, 10))
        .filter((n) => !Number.isNaN(n));
    } else if (multiQueryHomes.length) {
      homeIds = multiQueryHomes;
    } else if (singleHome) {
      homeIds = [singleHome];
    } else {
      homeIds = await fetchDefaultHomeIds(customerId);
    }

    return { customerId, homeIds, homeAccessRole: 'admin' };
  }

  // Production without auth: fail closed
  throw new Error('Unauthorized');
}

/**
 * Check if the scope allows write operations (non-viewer role)
 */
export function canWrite(scope: RequestScope): boolean {
  return scope.homeAccessRole !== 'viewer';
}

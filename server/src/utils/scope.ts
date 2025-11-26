import type { Request } from 'express';
import { db } from '../db/index.js';
import { sql } from '@postgress/shared';

export type RequestScope = {
  customerId: number;
  homeIds: number[]; // always concrete list on return
};

async function fetchUserScope(userId: number): Promise<{ customerId?: number; homeIds: number[] }> {
  // Get user's customer_id
  const userRes = await db.execute(sql`SELECT customer_id FROM users WHERE id = ${userId} LIMIT 1`);
  const rawUserRow: any = (userRes.rows as any[])[0];
  const customerId: number | undefined = rawUserRow && rawUserRow.customer_id != null ? Number(rawUserRow.customer_id) : undefined;

  // Get homes user has access to
  const homesRes = await db.execute(sql`SELECT home_id FROM user_home_access WHERE user_id = ${userId}`);
  const homeIds: number[] = (homesRes.rows as any[]).map((r) => Number(r.home_id)).filter((n) => Number.isFinite(n));
  return { customerId, homeIds };
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

  // Helper to parse single requested home from query/header
  const parseRequestedHomeId = (): number | null => {
    const q = (req.query as any)?.homeId;
    const h = req.header('x-home-id') || req.header('X-Home-Id');
    const raw = (Array.isArray(q) ? q[0] : q) ?? h;
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  // If authenticated, derive from DB and validate selected home
  const authUser: any = (req as any).user;
  if (authUser?.id) {
    const { customerId, homeIds } = await fetchUserScope(Number(authUser.id));
    if (!customerId) {
      // No customer association; deny in prod, fallback to dev defaults otherwise
      if (isProd) throw new Error('Unauthorized: no customer association');
      return { customerId: 1, homeIds: await fetchDefaultHomeIds(1) };
    }
    const allowed = homeIds.length > 0 ? homeIds : await fetchDefaultHomeIds(customerId);
    const requested = parseRequestedHomeId();
    const effective = requested && allowed.includes(requested) ? [requested] : allowed;
    return { customerId, homeIds: effective };
  }

  // No auth token: allow dev header overrides only when not in production
  if (!isProd) {
    const hdrCustomer = req.header('x-customer-id');
    const hdrHomes = req.header('x-home-ids');
    const singleHome = parseRequestedHomeId();

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
    } else if (singleHome) {
      homeIds = [singleHome];
    } else {
      homeIds = await fetchDefaultHomeIds(customerId);
    }

    return { customerId, homeIds };
  }

  // Production without auth: fail closed
  throw new Error('Unauthorized');
}

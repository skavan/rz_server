import { Router } from 'express';
import { bookingFinancials, bookingReservations, eq, and, desc } from '@skavan/rentalzen-drizzle';
import { authenticateToken, optionalAuth } from '../../auth/index.js';
import { requireWriteMiddleware } from '../../utils/auto-inject-middleware.js';
import { getRequestScope } from '../../utils/scope.js';
import type { RequestScope } from '../../utils/scope.js';
import { withTenantScope } from '../../db/index.js';
import { eventBus } from '../../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalDecimal,
  parseOptionalJson,
  parseOptionalString,
  parsePagination,
  requireDecimal,
  requireNumber,
  requireString,
} from '../shared/validation.js';

const router = Router();

function setField(target: any, key: string, value: any) {
  if (value !== undefined) {
    target[key] = value;
  }
}

async function ensureReservationAccessible(scopedDb: any, reservationId: number) {
  const existing = await scopedDb
    .select({ id: bookingReservations.id })
    .from(bookingReservations)
    .where(eq(bookingReservations.id, reservationId))
    .limit(1);

  if (existing.length === 0) {
    throw new ValidationError('Reservation not found for tenant scope', 404);
  }
}

function buildInsertPayload(body: any, scope: RequestScope) {
  const now = new Date();
  const reservationId = requireNumber(body?.reservationId, 'reservationId');
  const rent = requireDecimal(body?.rent, 'rent');
  const currency = requireString(body?.currency, 'currency');
  const grandTotal = requireDecimal(body?.grandTotal, 'grandTotal');

  const payload: Record<string, any> = {
    reservationId,
    rent,
    currency,
    grandTotal,
    createdAt: now,
    updatedAt: now,
  };

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt) payload.createdAt = createdAt;

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt) payload.updatedAt = updatedAt;

  setField(payload, 'taxes', parseOptionalJson(body?.taxes, 'taxes'));
  setField(payload, 'services', parseOptionalJson(body?.services, 'services'));
  setField(payload, 'discounts', parseOptionalJson(body?.discounts, 'discounts'));
  setField(payload, 'taxTotal', parseOptionalDecimal(body?.taxTotal, 'taxTotal'));
  setField(payload, 'serviceTotal', parseOptionalDecimal(body?.serviceTotal, 'serviceTotal'));
  setField(payload, 'discountTotal', parseOptionalDecimal(body?.discountTotal, 'discountTotal'));
  setField(payload, 'damageDeposit', parseOptionalDecimal(body?.damageDeposit, 'damageDeposit'));
  setField(payload, 'channelFee', parseOptionalDecimal(body?.channelFee, 'channelFee'));
  setField(payload, 'minNightlyPrice', parseOptionalDecimal(body?.minNightlyPrice, 'minNightlyPrice'));
  setField(payload, 'maxNightlyPrice', parseOptionalDecimal(body?.maxNightlyPrice, 'maxNightlyPrice'));
  setField(payload, 'isPaid', parseOptionalBoolean(body?.isPaid, 'isPaid'));
  setField(payload, 'externalId', parseOptionalString(body?.externalId));

  return payload;
}

function buildUpdatePayload(body: any) {
  const payload: Record<string, any> = {};

  if (body?.reservationId !== undefined) {
    payload.reservationId = requireNumber(body?.reservationId, 'reservationId');
  }
  if (body?.rent !== undefined) {
    payload.rent = requireDecimal(body?.rent, 'rent');
  }
  if (body?.currency !== undefined) {
    payload.currency = requireString(body?.currency, 'currency');
  }
  if (body?.grandTotal !== undefined) {
    payload.grandTotal = requireDecimal(body?.grandTotal, 'grandTotal');
  }

  setField(payload, 'taxes', parseOptionalJson(body?.taxes, 'taxes'));
  setField(payload, 'services', parseOptionalJson(body?.services, 'services'));
  setField(payload, 'discounts', parseOptionalJson(body?.discounts, 'discounts'));
  setField(payload, 'taxTotal', parseOptionalDecimal(body?.taxTotal, 'taxTotal'));
  setField(payload, 'serviceTotal', parseOptionalDecimal(body?.serviceTotal, 'serviceTotal'));
  setField(payload, 'discountTotal', parseOptionalDecimal(body?.discountTotal, 'discountTotal'));
  setField(payload, 'damageDeposit', parseOptionalDecimal(body?.damageDeposit, 'damageDeposit'));
  setField(payload, 'channelFee', parseOptionalDecimal(body?.channelFee, 'channelFee'));
  setField(payload, 'minNightlyPrice', parseOptionalDecimal(body?.minNightlyPrice, 'minNightlyPrice'));
  setField(payload, 'maxNightlyPrice', parseOptionalDecimal(body?.maxNightlyPrice, 'maxNightlyPrice'));
  setField(payload, 'isPaid', parseOptionalBoolean(body?.isPaid, 'isPaid'));
  setField(payload, 'externalId', parseOptionalString(body?.externalId));

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt !== undefined) {
    if (!createdAt) {
      throw new ValidationError('createdAt cannot be null');
    }
    payload.createdAt = createdAt;
  }

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt !== undefined) {
    if (!updatedAt) {
      throw new ValidationError('updatedAt cannot be null');
    }
    payload.updatedAt = updatedAt;
  } else {
    payload.updatedAt = new Date();
  }

  return payload;
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { reservationId } = req.query as Record<string, any>;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let query = scopedDb.select().from(bookingFinancials);
      if (reservationId) {
        const id = Number(reservationId);
        if (Number.isFinite(id)) {
          query = query.where(eq(bookingFinancials.reservationId, id));
        }
      }
      return query.orderBy(desc(bookingFinancials.updatedAt)).limit(limit).offset(offset);
    });

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingFinancials list error:', error);
    res.status(500).json({ error: 'Failed to fetch booking financials' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(bookingFinancials).where(eq(bookingFinancials.id, id)).limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking financial record not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingFinancials detail error:', error);
    res.status(500).json({ error: 'Failed to fetch booking financial record' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const payload = buildInsertPayload(req.body || {}, scope);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      await ensureReservationAccessible(scopedDb, payload.reservationId);
      return scopedDb.insert(bookingFinancials).values(payload).returning();
    });

    const created = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_financials',
      data: { type: 'create', resource: 'booking_financials', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Financials already exist for this reservation' });
    }
    console.error('bookingFinancials create error:', error);
    res.status(500).json({ error: 'Failed to create booking financial record' });
  }
});

router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');
    const updates = buildUpdatePayload(req.body || {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      if (updates.reservationId !== undefined) {
        await ensureReservationAccessible(scopedDb, updates.reservationId);
      }
      return scopedDb.update(bookingFinancials).set(updates).where(eq(bookingFinancials.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking financial record not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_financials',
      data: { type: 'update', resource: 'booking_financials', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingFinancials update error:', error);
    res.status(500).json({ error: 'Failed to update booking financial record' });
  }
});

router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(bookingFinancials).where(eq(bookingFinancials.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking financial record not found' });
    }

    const deleted = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_financials',
      data: { type: 'delete', resource: 'booking_financials', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingFinancials delete error:', error);
    res.status(500).json({ error: 'Failed to delete booking financial record' });
  }
});

export default router;

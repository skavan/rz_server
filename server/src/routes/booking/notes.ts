import { Router } from 'express';
import { bookingNotes, bookingReservations, eq, desc } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../../auth/index.js';
import { requireWriteMiddleware } from '../../utils/auto-inject-middleware.js';
import { getRequestScope } from '../../utils/scope.js';
import type { RequestScope } from '../../utils/scope.js';
import { withTenantScope } from '../../db/index.js';
import { eventBus } from '../../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalDate,
  parseOptionalString,
  parsePagination,
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
  const noteType = requireString(body?.noteType, 'noteType');
  const note = requireString(body?.note, 'note');

  const payload: Record<string, any> = {
    reservationId,
    noteType,
    note,
    createdAt: now,
    updatedAt: now,
  };

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt) payload.createdAt = createdAt;

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt) payload.updatedAt = updatedAt;

  setField(payload, 'externalId', parseOptionalString(body?.externalId));
  setField(payload, 'guestName', parseOptionalString(body?.guestName));
  setField(payload, 'guestEmail', parseOptionalString(body?.guestEmail));
  setField(payload, 'createdBy', body?.createdBy !== undefined ? requireNumber(body?.createdBy, 'createdBy') : undefined);
  setField(payload, 'deletedAt', parseOptionalDate(body?.deletedAt, 'deletedAt'));

  return payload;
}

function buildUpdatePayload(body: any) {
  const payload: Record<string, any> = {};

  if (body?.reservationId !== undefined) {
    payload.reservationId = requireNumber(body?.reservationId, 'reservationId');
  }
  if (body?.noteType !== undefined) {
    payload.noteType = requireString(body?.noteType, 'noteType');
  }
  if (body?.note !== undefined) {
    payload.note = requireString(body?.note, 'note');
  }

  setField(payload, 'externalId', parseOptionalString(body?.externalId));
  setField(payload, 'guestName', parseOptionalString(body?.guestName));
  setField(payload, 'guestEmail', parseOptionalString(body?.guestEmail));

  if (body?.createdBy !== undefined) {
    payload.createdBy = requireNumber(body?.createdBy, 'createdBy');
  }

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

  const deletedAt = parseOptionalDate(body?.deletedAt, 'deletedAt');
  if (deletedAt !== undefined) {
    payload.deletedAt = deletedAt;
  }

  return payload;
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { reservationId } = req.query as Record<string, any>;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset, { defaultLimit: 100, maxLimit: 500 });

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let query = scopedDb.select().from(bookingNotes);
      if (reservationId) {
        const id = Number(reservationId);
        if (Number.isFinite(id)) {
          query = query.where(eq(bookingNotes.reservationId, id));
        }
      }
      return query.orderBy(desc(bookingNotes.createdAt)).limit(limit).offset(offset);
    });

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingNotes list error:', error);
    res.status(500).json({ error: 'Failed to fetch booking notes' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(bookingNotes).where(eq(bookingNotes.id, id)).limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking note not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingNotes detail error:', error);
    res.status(500).json({ error: 'Failed to fetch booking note' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const payload = buildInsertPayload(req.body || {}, scope);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      await ensureReservationAccessible(scopedDb, payload.reservationId);
      return scopedDb.insert(bookingNotes).values(payload).returning();
    });

    const created = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_notes',
      data: { type: 'create', resource: 'booking_notes', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingNotes create error:', error);
    res.status(500).json({ error: 'Failed to create booking note' });
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
      return scopedDb.update(bookingNotes).set(updates).where(eq(bookingNotes.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking note not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_notes',
      data: { type: 'update', resource: 'booking_notes', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingNotes update error:', error);
    res.status(500).json({ error: 'Failed to update booking note' });
  }
});

router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(bookingNotes).where(eq(bookingNotes.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking note not found' });
    }

    const deleted = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_notes',
      data: { type: 'delete', resource: 'booking_notes', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingNotes delete error:', error);
    res.status(500).json({ error: 'Failed to delete booking note' });
  }
});

export default router;

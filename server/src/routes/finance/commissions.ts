import { Router } from 'express';
import { financeCommissions, bookingReservations, eq, desc } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../../auth/index.js';
import { getRequestScope } from '../../utils/scope.js';
import type { RequestScope } from '../../utils/scope.js';
import { withTenantScope } from '../../db/index.js';
import { eventBus } from '../../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalDecimal,
  parseOptionalInteger,
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

const OPTIONAL_STRING_FIELDS = [
  'type',
  'leadSourceId',
  'agentName',
  'channelName',
  'currency',
  'calculationBase',
  'paymentStatus',
  'paymentMethod',
  'notes',
  'externalId',
];

const OPTIONAL_DECIMAL_FIELDS = [
  'originalRate',
  'percentage',
  'fixedAmount',
  'calculatedAmount',
];

const OPTIONAL_DATE_FIELDS = [
  'paidAt',
  'dueDate',
  'createdAt',
  'updatedAt',
];

function buildInsertPayload(body: any, scope: RequestScope) {
  const now = new Date();
  const reservationId = requireNumber(body?.reservationId, 'reservationId');
  const name = requireString(body?.name, 'name');
  const type = requireString(body?.type, 'type');
  const calculationType = requireString(body?.calculationType, 'calculationType');
  const calculatedAmount = requireDecimal(body?.calculatedAmount, 'calculatedAmount');

  const payload: Record<string, any> = {
    tenantId: scope.customerId,
    reservationId,
    name,
    type,
    calculationType,
    calculatedAmount,
    createdAt: now,
    updatedAt: now,
  };

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt) payload.createdAt = createdAt;

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt) payload.updatedAt = updatedAt;

  setField(payload, 'leadSourceId', parseOptionalInteger(body?.leadSourceId, 'leadSourceId'));
  setField(payload, 'agentId', parseOptionalInteger(body?.agentId, 'agentId'));
  setField(payload, 'agentName', parseOptionalString(body?.agentName));
  setField(payload, 'channelName', parseOptionalString(body?.channelName));
  setField(payload, 'isRateOverridden', parseOptionalBoolean(body?.isRateOverridden, 'isRateOverridden'));
  setField(payload, 'originalRate', parseOptionalDecimal(body?.originalRate, 'originalRate'));
  setField(payload, 'percentage', parseOptionalDecimal(body?.percentage, 'percentage'));
  setField(payload, 'fixedAmount', parseOptionalDecimal(body?.fixedAmount, 'fixedAmount'));
  setField(payload, 'currency', parseOptionalString(body?.currency));
  setField(payload, 'calculationBase', parseOptionalString(body?.calculationBase));
  setField(payload, 'paymentStatus', parseOptionalString(body?.paymentStatus));
  setField(payload, 'paidAt', parseOptionalDate(body?.paidAt, 'paidAt'));
  setField(payload, 'paymentMethod', parseOptionalString(body?.paymentMethod));
  setField(payload, 'dueDate', parseOptionalDate(body?.dueDate, 'dueDate'));
  setField(payload, 'notes', parseOptionalString(body?.notes));
  setField(payload, 'externalId', parseOptionalString(body?.externalId));

  return payload;
}

function buildUpdatePayload(body: any, scope: RequestScope) {
  const payload: Record<string, any> = {};

  if (body?.reservationId !== undefined) {
    payload.reservationId = requireNumber(body?.reservationId, 'reservationId');
  }
  if (body?.name !== undefined) {
    payload.name = requireString(body?.name, 'name');
  }
  if (body?.type !== undefined) {
    payload.type = requireString(body?.type, 'type');
  }
  if (body?.calculationType !== undefined) {
    payload.calculationType = requireString(body?.calculationType, 'calculationType');
  }
  if (body?.calculatedAmount !== undefined) {
    payload.calculatedAmount = requireDecimal(body?.calculatedAmount, 'calculatedAmount');
  }

  setField(payload, 'leadSourceId', parseOptionalInteger(body?.leadSourceId, 'leadSourceId'));
  setField(payload, 'agentId', parseOptionalInteger(body?.agentId, 'agentId'));
  setField(payload, 'agentName', parseOptionalString(body?.agentName));
  setField(payload, 'channelName', parseOptionalString(body?.channelName));
  setField(payload, 'isRateOverridden', parseOptionalBoolean(body?.isRateOverridden, 'isRateOverridden'));
  setField(payload, 'originalRate', parseOptionalDecimal(body?.originalRate, 'originalRate'));
  setField(payload, 'percentage', parseOptionalDecimal(body?.percentage, 'percentage'));
  setField(payload, 'fixedAmount', parseOptionalDecimal(body?.fixedAmount, 'fixedAmount'));
  setField(payload, 'currency', parseOptionalString(body?.currency));
  setField(payload, 'calculationBase', parseOptionalString(body?.calculationBase));
  setField(payload, 'paymentStatus', parseOptionalString(body?.paymentStatus));
  setField(payload, 'paidAt', parseOptionalDate(body?.paidAt, 'paidAt'));
  setField(payload, 'paymentMethod', parseOptionalString(body?.paymentMethod));
  setField(payload, 'dueDate', parseOptionalDate(body?.dueDate, 'dueDate'));
  setField(payload, 'notes', parseOptionalString(body?.notes));
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
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset, { defaultLimit: 100, maxLimit: 500 });

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let query = scopedDb.select().from(financeCommissions);
      if (reservationId) {
        const id = Number(reservationId);
        if (Number.isFinite(id)) {
          query = query.where(eq(financeCommissions.reservationId, id));
        }
      }
      return query.orderBy(desc(financeCommissions.updatedAt)).limit(limit).offset(offset);
    });

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('financeCommissions list error:', error);
    res.status(500).json({ error: 'Failed to fetch finance commissions' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(financeCommissions).where(eq(financeCommissions.id, id)).limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Finance commission not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('financeCommissions detail error:', error);
    res.status(500).json({ error: 'Failed to fetch finance commission' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const payload = buildInsertPayload(req.body || {}, scope);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      await ensureReservationAccessible(scopedDb, payload.reservationId);
      return scopedDb.insert(financeCommissions).values(payload).returning();
    });

    const created = rows[0];

    eventBus.broadcast({
      event: 'data_change:finance_commissions',
      data: { type: 'create', resource: 'finance_commissions', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('financeCommissions create error:', error);
    res.status(500).json({ error: 'Failed to create finance commission' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');
    const updates = buildUpdatePayload(req.body || {}, scope);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      if (updates.reservationId !== undefined) {
        await ensureReservationAccessible(scopedDb, updates.reservationId);
      }
      return scopedDb.update(financeCommissions).set(updates).where(eq(financeCommissions.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Finance commission not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:finance_commissions',
      data: { type: 'update', resource: 'finance_commissions', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('financeCommissions update error:', error);
    res.status(500).json({ error: 'Failed to update finance commission' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(financeCommissions).where(eq(financeCommissions.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Finance commission not found' });
    }

    const deleted = rows[0];

    eventBus.broadcast({
      event: 'data_change:finance_commissions',
      data: { type: 'delete', resource: 'finance_commissions', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('financeCommissions delete error:', error);
    res.status(500).json({ error: 'Failed to delete finance commission' });
  }
});

export default router;

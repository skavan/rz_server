import { Router } from 'express';
import {
  bookingReservations,
  eq,
  ilike,
  and,
  or,
  desc,
  gte,
  lte,
} from '@postgress/shared';
import type { RequestScope } from '../../utils/scope.js';
import { getRequestScope } from '../../utils/scope.js';
import { withTenantScope } from '../../db/index.js';
import { authenticateToken, optionalAuth } from '../../auth/index.js';
import { eventBus } from '../../utils/event-bus.js';
import {
  ValidationError,
  ensureHomeAccess,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalDecimal,
  parseOptionalInteger,
  parseOptionalString,
  parsePagination,
  parseStringArray,
  requireDate,
  requireDecimal,
  requireNumber,
  requireString,
} from '../shared/validation.js';

const router = Router();

const OPTIONAL_STRING_FIELDS = [
  'externalId',
  'confirmationCode',
  'bookingType',
  'language',
  'specialRequests',
  'lockboxCode',
  'wifiPassword',
  'overrideReason',
  'cancellationReason',
  'notes',
  'firstName',
  'lastName',
  'currency',
];

const OPTIONAL_DECIMAL_FIELDS = [
  'rent',
  'taxes',
  'services',
  'discounts',
  'commissions',
  'expenses',
  'guestTotal',
  'ownerTotal',
  'damageDeposit',
  'fundsReceived',
];

const OPTIONAL_INTEGER_FIELDS = [
  'primaryGuestId',
  'guestPartyId',
  'leadSourceId',
  'bookingChannelId',
  'housekeeperId',
  'checkInManagerId',
  'conciergeId',
  'bedrooms',
];

const OPTIONAL_DATE_FIELDS = [
  'nextPaymentDueDate',
  'confirmedAt',
  'cancelledAt',
  'deletedAt',
];

function setField(target: any, key: string, value: any) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function buildInsertPayload(body: any, scope: RequestScope) {
  const now = new Date();
  const homeId = requireNumber(body?.homeId, 'homeId');
  ensureHomeAccess(scope, homeId);

  const status = requireString(body?.status, 'status');
  const checkIn = requireDate(body?.checkIn, 'checkIn');
  const checkOut = requireDate(body?.checkOut, 'checkOut');
  const nights = requireNumber(body?.nights, 'nights');
  const adults = requireNumber(body?.adults, 'adults');
  const children = requireNumber(body?.children, 'children');
  const createdBy = requireNumber(body?.createdBy, 'createdBy');
  const amountOutstanding = requireDecimal(body?.amountOutstanding, 'amountOutstanding');

  const payload: Record<string, any> = {
    tenantId: scope.customerId,
    homeId,
    status,
    checkIn,
    checkOut,
    nights,
    adults,
    children,
    createdBy,
    amountOutstanding,
    pets: parseOptionalInteger(body?.pets, 'pets') ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt) payload.createdAt = createdAt;

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt) payload.updatedAt = updatedAt;

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (field === 'tags') continue;
    setField(payload, field, parseOptionalString(body?.[field]));
  }

  for (const field of OPTIONAL_DECIMAL_FIELDS) {
    setField(payload, field, parseOptionalDecimal(body?.[field], field));
  }

  for (const field of OPTIONAL_INTEGER_FIELDS) {
    setField(payload, field, parseOptionalInteger(body?.[field], field));
  }

  for (const field of OPTIONAL_DATE_FIELDS) {
    setField(payload, field, parseOptionalDate(body?.[field], field));
  }

  const isOwnerBooking = parseOptionalBoolean(body?.isOwnerBooking, 'isOwnerBooking');
  const isPriceOverridden = parseOptionalBoolean(body?.isPriceOverridden, 'isPriceOverridden');
  setField(payload, 'isOwnerBooking', isOwnerBooking);
  setField(payload, 'isPriceOverridden', isPriceOverridden);

  const tags = parseStringArray(body?.tags, 'tags');
  setField(payload, 'tags', tags);

  return payload;
}

function buildUpdatePayload(body: any, scope: RequestScope) {
  const payload: Record<string, any> = {};

  if (body?.homeId !== undefined) {
    const homeId = requireNumber(body?.homeId, 'homeId');
    ensureHomeAccess(scope, homeId);
    payload.homeId = homeId;
  }

  if (body?.status !== undefined) {
    payload.status = requireString(body?.status, 'status');
  }

  if (body?.checkIn !== undefined) {
    payload.checkIn = requireDate(body?.checkIn, 'checkIn');
  }

  if (body?.checkOut !== undefined) {
    payload.checkOut = requireDate(body?.checkOut, 'checkOut');
  }

  if (body?.nights !== undefined) {
    payload.nights = requireNumber(body?.nights, 'nights');
  }

  if (body?.adults !== undefined) {
    payload.adults = requireNumber(body?.adults, 'adults');
  }

  if (body?.children !== undefined) {
    payload.children = requireNumber(body?.children, 'children');
  }

  if (body?.createdBy !== undefined) {
    payload.createdBy = requireNumber(body?.createdBy, 'createdBy');
  }

  if (body?.pets !== undefined) {
    payload.pets = parseOptionalInteger(body?.pets, 'pets') ?? 0;
  }

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (field === 'tags') continue;
    setField(payload, field, parseOptionalString(body?.[field]));
  }

  for (const field of OPTIONAL_DECIMAL_FIELDS) {
    setField(payload, field, parseOptionalDecimal(body?.[field], field));
  }

  for (const field of OPTIONAL_INTEGER_FIELDS) {
    setField(payload, field, parseOptionalInteger(body?.[field], field));
  }

  for (const field of OPTIONAL_DATE_FIELDS) {
    setField(payload, field, parseOptionalDate(body?.[field], field));
  }

  const isOwnerBooking = parseOptionalBoolean(body?.isOwnerBooking, 'isOwnerBooking');
  const isPriceOverridden = parseOptionalBoolean(body?.isPriceOverridden, 'isPriceOverridden');
  setField(payload, 'isOwnerBooking', isOwnerBooking);
  setField(payload, 'isPriceOverridden', isPriceOverridden);

  if (body?.amountOutstanding !== undefined) {
    payload.amountOutstanding = requireDecimal(body?.amountOutstanding, 'amountOutstanding');
  }

  const tags = parseStringArray(body?.tags, 'tags');
  setField(payload, 'tags', tags);

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
    const { status, homeId, search, from, to } = req.query as Record<string, any>;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset, { defaultLimit: 50, maxLimit: 200 });

    const clauses: any[] = [];

    if (status) {
      clauses.push(eq(bookingReservations.status, String(status).trim()));
    }

    if (homeId) {
      const home = Number(homeId);
      if (Number.isFinite(home)) {
        clauses.push(eq(bookingReservations.homeId, home));
      }
    }

    const fromDate = parseOptionalDate(from, 'from');
    if (fromDate) {
      clauses.push(gte(bookingReservations.checkIn, fromDate));
    }

    const toDate = parseOptionalDate(to, 'to');
    if (toDate) {
      clauses.push(lte(bookingReservations.checkOut, toDate));
    }

    const searchTerm = typeof search === 'string' ? search.trim() : '';

    if (searchTerm) {
      const like = `%${searchTerm}%`;
      clauses.push(
        or(
          ilike(bookingReservations.confirmationCode, like),
          ilike(bookingReservations.externalId, like),
          ilike(bookingReservations.firstName, like),
          ilike(bookingReservations.lastName, like)
        )
      );
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let query = scopedDb.select().from(bookingReservations);
      if (clauses.length === 1) {
        query = query.where(clauses[0]);
      } else if (clauses.length > 1) {
        query = query.where(and(...clauses));
      }
      return query.orderBy(desc(bookingReservations.createdAt)).limit(limit).offset(offset);
    });

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingReservations list error:', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const reservationId = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(bookingReservations).where(eq(bookingReservations.id, reservationId)).limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingReservations detail error:', error);
    res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const payload = buildInsertPayload(req.body || {}, scope);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.insert(bookingReservations).values(payload).returning();
    });

    const created = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_reservations',
      data: { type: 'create', resource: 'booking_reservations', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Reservation already exists with that identifier' });
    }
    console.error('bookingReservations create error:', error);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const reservationId = requireNumber(req.params.id, 'id');
    const updates = buildUpdatePayload(req.body || {}, scope);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.update(bookingReservations).set(updates).where(eq(bookingReservations.id, reservationId)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_reservations',
      data: { type: 'update', resource: 'booking_reservations', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingReservations update error:', error);
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const reservationId = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(bookingReservations).where(eq(bookingReservations.id, reservationId)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const deleted = rows[0];

    eventBus.broadcast({
      event: 'data_change:booking_reservations',
      data: { type: 'delete', resource: 'booking_reservations', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('bookingReservations delete error:', error);
    res.status(500).json({ error: 'Failed to delete reservation' });
  }
});

export default router;

import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import { reservations, eq, and } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';

const router = Router();

const RESERVATION_SELECT = {
  id: reservations.id,
  bookingId: reservations.bookingId,
  firstName: reservations.firstName,
  lastName: reservations.lastName,
  fullName: reservations.fullName,
  email: reservations.email,
  status: reservations.status,
  propertyId: reservations.propertyId,
  ownerBook: reservations.ownerBook,
  leadsourceId: reservations.leadsourceId,
  totalRent: reservations.totalRent,
  taxTotal: reservations.taxTotal,
  serviceTotal: reservations.serviceTotal,
  discountTotal: reservations.discountTotal,
  grandTotal: reservations.grandTotal,
  damageDeposit: reservations.damageDeposit,
  channelFee: reservations.channelFee,
  checkin: reservations.checkin,
  checkout: reservations.checkout,
  qtyOfNights: reservations.qtyOfNights,
  numberOfAdults: reservations.numberOfAdults,
  numberOfChildren: reservations.numberOfChildren,
  createdDate: reservations.createdDate,
};

const NUMBER_FIELDS = [
  'propertyId',
  'ownerBook',
  'leadsourceId',
  'brandId',
  'qtyOfNights',
  'numberOfAdults',
  'numberOfChildren',
  'minimumStay',
  'maximumStay',
];

const DECIMAL_FIELDS = [
  'totalRent',
  'taxTotal',
  'serviceTotal',
  'discountTotal',
  'grandTotal',
  'damageDeposit',
  'channelFee',
  'minNightlyPrice',
  'maxNightlyPrice',
];

const DATE_FIELDS = [
  'checkin',
  'checkout',
  'createdDate',
  'updatedDate',
  'cancellationDate',
];

const JSON_FIELDS = [
  'nightlyPriceDetail',
  'discount',
  'dynamicOptions',
  'tax',
  'service',
];

const STRING_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'birthday',
  'birthplace',
  'phone1',
  'phone2',
  'country',
  'phoneCountryCode',
  'address',
  'city',
  'state',
  'postcode',
  'fiscalCode',
  'other',
  'agreeTermNote',
  'managerNote',
  'propertyName',
];

class ValidationError extends Error {
  status = 400;
}

function requireNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${field} must be a number`);
  }
  return parsed;
}

function readOptionalNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requireNumber(value, field);
}

function readOptionalDecimal(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${field} must be a numeric value`);
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return String(value).trim();
}

function readOptionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as any);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  return parsed;
}

function readOptionalJson(value: unknown, field: string): any {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (err) {
      throw new ValidationError(`${field} must be valid JSON`);
    }
  }
  if (typeof value === 'object') {
    return value;
  }
  throw new ValidationError(`${field} must be an object or array`);
}

function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value);
  return str.trim().length === 0 ? null : str;
}

function readOptionalBoolean(value: unknown, field: string): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new ValidationError(`${field} must be a boolean`);
}

function buildInsertPayload(body: any) {
  const status = readOptionalString(body.status);
  if (!status) {
    throw new ValidationError('status is required');
  }

  const payload: any = {
    customerId: requireNumber(body.customerId, 'customerId'),
    homeId: requireNumber(body.homeId, 'homeId'),
    bookingId: requireNumber(body.bookingId, 'bookingId'),
    status,
  };

  for (const field of STRING_FIELDS) {
    const val = readOptionalString(body[field]);
    payload[field] = val ?? null;
  }

  for (const field of NUMBER_FIELDS) {
    const val = readOptionalNumber(body[field], field);
    payload[field] = val ?? null;
  }

  for (const field of DECIMAL_FIELDS) {
    const val = readOptionalDecimal(body[field], field);
    payload[field] = val ?? null;
  }

  for (const field of DATE_FIELDS) {
    const val = readOptionalDate(body[field], field);
    payload[field] = val ?? null;
  }

  for (const field of JSON_FIELDS) {
    const val = readOptionalJson(body[field], field);
    payload[field] = val ?? null;
  }

  const booleanVal = readOptionalBoolean(body.isActive, 'isActive');
  payload.isActive = booleanVal === undefined ? true : (booleanVal ?? false);

  if (payload.ownerBook == null) {
    payload.ownerBook = 0;
  }

  const currency = readOptionalString(body.currency);
  payload.currency = currency ?? 'USD';

  return payload;
}

function buildUpdatePayload(body: any) {
  const payload: any = {};

  if ('bookingId' in body) {
    const bookingId = readOptionalNumber(body.bookingId, 'bookingId');
    if (bookingId == null) {
      throw new ValidationError('bookingId must be provided when updating');
    }
    payload.bookingId = bookingId;
  }

  if ('status' in body) {
    const status = readOptionalString(body.status);
    if (!status) {
      throw new ValidationError('status cannot be empty');
    }
    payload.status = status;
  }

  for (const field of STRING_FIELDS) {
    if (field in body) {
      payload[field] = readOptionalString(body[field]) ?? null;
    }
  }

  for (const field of NUMBER_FIELDS) {
    if (field in body) {
      const value = readOptionalNumber(body[field], field);
      payload[field] = value ?? null;
    }
  }

  for (const field of DECIMAL_FIELDS) {
    if (field in body) {
      const value = readOptionalDecimal(body[field], field);
      payload[field] = value ?? null;
    }
  }

  for (const field of DATE_FIELDS) {
    if (field in body) {
      const value = readOptionalDate(body[field], field);
      payload[field] = value ?? null;
    }
  }

  for (const field of JSON_FIELDS) {
    if (field in body) {
      const value = readOptionalJson(body[field], field);
      payload[field] = value ?? null;
    }
  }

  if ('currency' in body) {
    payload.currency = readOptionalString(body.currency) ?? 'USD';
  }

  if ('isActive' in body) {
    const boolVal = readOptionalBoolean(body.isActive, 'isActive');
    if (boolVal === undefined) {
      throw new ValidationError('isActive must be a boolean');
    }
    payload.isActive = boolVal ?? false;
  }

  return payload;
}

function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * GET /api/reservations-v1
 * Get all reservations with minimal fields
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const reservationList = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select(RESERVATION_SELECT)
        .from(reservations)
        .where(eq(reservations.isActive, true))
        .orderBy(reservations.checkin);
    });

    res.json({
      success: true,
      data: reservationList,
      count: reservationList.length,
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reservations',
    });
  }
});

/**
 * GET /api/reservations-v1/:id
 * Get a single reservation by ID with minimal fields
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid reservation id' });
    }

    const scope = await getRequestScope(req as any);
    const reservationRecord = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select(RESERVATION_SELECT)
        .from(reservations)
        .where(eq(reservations.id, id))
        .limit(1);
    });

    if (reservationRecord.length === 0) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    res.json({ success: true, data: reservationRecord[0] });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reservation' });
  }
});

/**
 * GET /api/reservations-v1/property/:propertyId
 * Get reservations for a specific property
 */
router.get('/property/:propertyId', optionalAuth, async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId)) {
      return res.status(400).json({ success: false, error: 'Invalid property id' });
    }

    const scope = await getRequestScope(req as any);
    const reservationList = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select(RESERVATION_SELECT)
        .from(reservations)
        .where(and(eq(reservations.propertyId, propertyId), eq(reservations.isActive, true)))
        .orderBy(reservations.checkin);
    });

    res.json({
      success: true,
      data: reservationList,
      count: reservationList.length,
    });
  } catch (error) {
    console.error('Error fetching property reservations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch property reservations' });
  }
});

/**
 * GET /api/reservations-v1/status/:status
 * Get reservations by status (reserved, confirmed, cancelled, etc.)
 */
router.get('/status/:status', optionalAuth, async (req, res) => {
  try {
    const statusParam = String(req.params.status || '').trim();
    if (!statusParam) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const scope = await getRequestScope(req as any);
    const reservationList = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select(RESERVATION_SELECT)
        .from(reservations)
        .where(and(eq(reservations.status, statusParam), eq(reservations.isActive, true)))
        .orderBy(reservations.checkin);
    });

    res.json({ success: true, data: reservationList, count: reservationList.length });
  } catch (error) {
    console.error('Error fetching reservations by status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reservations by status' });
  }
});

/**
 * POST /api/reservations-v1
 * Create a new reservation (requires auth)
 */
router.post('/', authenticateToken, autoInjectMiddleware('reservations', { requireWrite: true }), async (req, res) => {
  try {
    const scope = getScopeFromRequest(req as any);
    const payload = buildInsertPayload(req.body || {});

    const createdRecords = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.insert(reservations).values(payload).returning();
    });

    const created = createdRecords[0];

    eventBus.broadcast({
      event: 'data_change:reservations_v1',
      data: { type: 'create', resource: 'reservations_v1', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    if (isValidationError(error)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error?.code === '23505') {
      return res.status(409).json({ success: false, error: 'Reservation with that bookingId already exists' });
    }
    console.error('Error creating reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to create reservation' });
  }
});

/**
 * PUT /api/reservations-v1/:id
 * Update an existing reservation (requires auth)
 */
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const reservationId = Number(req.params.id);
    if (!Number.isFinite(reservationId)) {
      return res.status(400).json({ success: false, error: 'Invalid reservation id' });
    }

    const scope = await getRequestScope(req as any);
    const updates = buildUpdatePayload(req.body || {});
    updates.updatedAt = new Date();

    const updatedRecords = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .update(reservations)
        .set(updates)
        .where(eq(reservations.id, reservationId))
        .returning();
    });

    if (updatedRecords.length === 0) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    const updated = updatedRecords[0];

    eventBus.broadcast({
      event: 'data_change:reservations_v1',
      data: { type: 'update', resource: 'reservations_v1', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Error updating reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to update reservation' });
  }
});

/**
 * DELETE /api/reservations-v1/:id
 * Delete a reservation (requires auth)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const reservationId = Number(req.params.id);
    if (!Number.isFinite(reservationId)) {
      return res.status(400).json({ success: false, error: 'Invalid reservation id' });
    }

    const scope = await getRequestScope(req as any);
    const deletedRecords = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(reservations)
        .where(eq(reservations.id, reservationId))
        .returning();
    });

    if (deletedRecords.length === 0) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    const deleted = deletedRecords[0];

    eventBus.broadcast({
      event: 'data_change:reservations_v1',
      data: { type: 'delete', resource: 'reservations_v1', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: scope.homeIds } },
    });

    res.json({ success: true, message: 'Reservation deleted successfully' });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to delete reservation' });
  }
});

export default router;

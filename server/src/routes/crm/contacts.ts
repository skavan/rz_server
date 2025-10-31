import { Router } from 'express';
import { crmContacts, eq, ilike, or, and, desc } from '@postgress/shared';
import type { RequestScope } from '../../utils/scope.js';
import { getRequestScope } from '../../utils/scope.js';
import { withTenantScope } from '../../db/index.js';
import { authenticateToken, optionalAuth } from '../../auth/index.js';
import { eventBus } from '../../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalInteger,
  parseOptionalJson,
  parseOptionalString,
  parsePagination,
  parseStringArray,
  requireNumber,
} from '../shared/validation.js';

const router = Router();

const STRING_FIELDS = [
  'externalId',
  'firstName',
  'lastName',
  'email',
  'phone',
  'secondaryPhone',
  'secondaryEmail',
  'dateOfBirth',
  'placeOfBirth',
  'fiscalCode',
  'phoneCountryCode',
  'occupation',
  'jobTitle',
  'companyName',
  'websiteUrl',
  'guestPartyRole',
  'status',
  'notes',
];

const JSON_FIELDS = [
  'address',
  'preferences',
  'emergencyContacts',
  'relationships',
  'communicationPreferences',
];

const NUMBER_FIELDS = [
  'guestPartyId',
  'ageAtBooking',
];

const BOOLEAN_FIELDS = [
  'isPrimary',
  'isMultipleTransactions',
];

function setField(target: any, key: string, value: any) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function buildInsertPayload(body: any, scope: RequestScope) {
  const now = new Date();
  const payload: Record<string, any> = {
    tenantId: scope.customerId,
    createdAt: now,
    updatedAt: now,
  };

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt) payload.createdAt = createdAt;

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt) payload.updatedAt = updatedAt;

  const deletedAt = parseOptionalDate(body?.deletedAt, 'deletedAt');
  if (deletedAt !== undefined) payload.deletedAt = deletedAt;

  for (const field of STRING_FIELDS) {
    setField(payload, field, parseOptionalString(body?.[field]));
  }

  if (!('status' in payload) || payload.status == null) {
    payload.status = 'active';
  }

  for (const field of JSON_FIELDS) {
    setField(payload, field as string, parseOptionalJson(body?.[field], field as string));
  }

  for (const field of NUMBER_FIELDS) {
    setField(payload, field as string, parseOptionalInteger(body?.[field], field as string));
  }

  for (const field of BOOLEAN_FIELDS) {
    setField(payload, field as string, parseOptionalBoolean(body?.[field], field as string));
  }

  const tags = parseStringArray(body?.tags, 'tags');
  setField(payload, 'tags', tags);

  return payload;
}

function buildUpdatePayload(body: any) {
  const payload: Record<string, any> = {};

  for (const field of STRING_FIELDS) {
    setField(payload, field, parseOptionalString(body?.[field]));
  }

  for (const field of JSON_FIELDS) {
    setField(payload, field as string, parseOptionalJson(body?.[field], field as string));
  }

  for (const field of NUMBER_FIELDS) {
    setField(payload, field as string, parseOptionalInteger(body?.[field], field as string));
  }

  for (const field of BOOLEAN_FIELDS) {
    setField(payload, field as string, parseOptionalBoolean(body?.[field], field as string));
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

  const deletedAt = parseOptionalDate(body?.deletedAt, 'deletedAt');
  if (deletedAt !== undefined) {
    payload.deletedAt = deletedAt;
  }

  return payload;
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { search, status } = req.query as Record<string, any>;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset, { defaultLimit: 50, maxLimit: 200 });

    const searchTerm = typeof search === 'string' ? search.trim() : '';
    const statusFilter = typeof status === 'string' ? status.trim() : '';

    const data = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let query = scopedDb.select().from(crmContacts);
      const clauses: any[] = [];

      if (statusFilter) {
        clauses.push(eq(crmContacts.status, statusFilter));
      }

      if (searchTerm) {
        const like = `%${searchTerm}%`;
        clauses.push(
          or(
            ilike(crmContacts.firstName, like),
            ilike(crmContacts.lastName, like),
            ilike(crmContacts.email, like),
            ilike(crmContacts.phone, like)
          )
        );
      }

      if (clauses.length === 1) {
        query = query.where(clauses[0]);
      } else if (clauses.length > 1) {
        query = query.where(and(...clauses));
      }

      return query.orderBy(desc(crmContacts.updatedAt)).limit(limit).offset(offset);
    });

    res.json({ data, meta: { count: data.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmContacts list error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const contactId = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmContacts detail error:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const payload = buildInsertPayload(req.body || {}, scope);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.insert(crmContacts).values(payload).returning();
    });

    const created = rows[0];

    eventBus.broadcast({
      event: 'data_change:crm_contacts',
      data: { type: 'create', resource: 'crm_contacts', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmContacts create error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const contactId = requireNumber(req.params.id, 'id');
    const updates = buildUpdatePayload(req.body || {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.update(crmContacts).set(updates).where(eq(crmContacts.id, contactId)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:crm_contacts',
      data: { type: 'update', resource: 'crm_contacts', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmContacts update error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const contactId = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(crmContacts).where(eq(crmContacts.id, contactId)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const deleted = rows[0];

    eventBus.broadcast({
      event: 'data_change:crm_contacts',
      data: { type: 'delete', resource: 'crm_contacts', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmContacts delete error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;

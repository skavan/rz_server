import { Router } from 'express';
import { crmLeadSources, eq, ilike, and, desc } from '@postgress/shared';
import type { RequestScope } from '../../utils/scope.js';
import { getRequestScope } from '../../utils/scope.js';
import { withTenantScope } from '../../db/index.js';
import { authenticateToken, optionalAuth } from '../../auth/index.js';
import { eventBus } from '../../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalDecimal,
  parseOptionalInteger,
  parseOptionalString,
  parsePagination,
  requireNumber,
  requireString,
} from '../shared/validation.js';

const router = Router();

const OPTIONAL_STRING_FIELDS = [
  'description',
  'sourceType',
  'defaultCommissionType',
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
    name: requireString(body?.name, 'name'),
    createdAt: now,
    updatedAt: now,
  };

  const createdAt = parseOptionalDate(body?.createdAt, 'createdAt');
  if (createdAt) payload.createdAt = createdAt;

  const updatedAt = parseOptionalDate(body?.updatedAt, 'updatedAt');
  if (updatedAt) payload.updatedAt = updatedAt;

  for (const field of OPTIONAL_STRING_FIELDS) {
    setField(payload, field, parseOptionalString(body?.[field]));
  }

  setField(payload, 'defaultCommissionRate', parseOptionalDecimal(body?.defaultCommissionRate, 'defaultCommissionRate'));
  setField(payload, 'defaultCommissionAmount', parseOptionalDecimal(body?.defaultCommissionAmount, 'defaultCommissionAmount'));
  setField(payload, 'isActive', parseOptionalBoolean(body?.isActive, 'isActive'));
  setField(payload, 'sortOrder', parseOptionalInteger(body?.sortOrder, 'sortOrder'));

  return payload;
}

function buildUpdatePayload(body: any) {
  const payload: Record<string, any> = {};

  if (body?.name !== undefined) {
    const name = requireString(body?.name, 'name');
    payload.name = name;
  }

  for (const field of OPTIONAL_STRING_FIELDS) {
    setField(payload, field, parseOptionalString(body?.[field]));
  }

  setField(payload, 'defaultCommissionRate', parseOptionalDecimal(body?.defaultCommissionRate, 'defaultCommissionRate'));
  setField(payload, 'defaultCommissionAmount', parseOptionalDecimal(body?.defaultCommissionAmount, 'defaultCommissionAmount'));
  setField(payload, 'isActive', parseOptionalBoolean(body?.isActive, 'isActive'));
  setField(payload, 'sortOrder', parseOptionalInteger(body?.sortOrder, 'sortOrder'));

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
    const { search, isActive } = req.query as Record<string, any>;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset, { defaultLimit: 50, maxLimit: 200 });

    const searchTerm = typeof search === 'string' ? search.trim() : '';
    const activeFilter = typeof isActive === 'string' ? isActive.trim() : '';

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let query = scopedDb.select().from(crmLeadSources);
      const clauses: any[] = [];

      if (searchTerm) {
        clauses.push(ilike(crmLeadSources.name, `%${searchTerm}%`));
      }

      if (activeFilter) {
        clauses.push(eq(crmLeadSources.isActive, activeFilter === 'true'));
      }

      if (clauses.length === 1) {
        query = query.where(clauses[0]);
      } else if (clauses.length > 1) {
        query = query.where(and(...clauses));
      }

      return query.orderBy(desc(crmLeadSources.updatedAt)).limit(limit).offset(offset);
    });

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmLeadSources list error:', error);
    res.status(500).json({ error: 'Failed to fetch lead sources' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(crmLeadSources).where(eq(crmLeadSources.id, id)).limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead source not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmLeadSources detail error:', error);
    res.status(500).json({ error: 'Failed to fetch lead source' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const payload = buildInsertPayload(req.body || {}, scope);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.insert(crmLeadSources).values(payload).returning();
    });

    const created = rows[0];

    eventBus.broadcast({
      event: 'data_change:crm_lead_sources',
      data: { type: 'create', resource: 'crm_lead_sources', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmLeadSources create error:', error);
    res.status(500).json({ error: 'Failed to create lead source' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');
    const updates = buildUpdatePayload(req.body || {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.update(crmLeadSources).set(updates).where(eq(crmLeadSources.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead source not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:crm_lead_sources',
      data: { type: 'update', resource: 'crm_lead_sources', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmLeadSources update error:', error);
    res.status(500).json({ error: 'Failed to update lead source' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(crmLeadSources).where(eq(crmLeadSources.id, id)).returning();
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead source not found' });
    }

    const deleted = rows[0];

    eventBus.broadcast({
      event: 'data_change:crm_lead_sources',
      data: { type: 'delete', resource: 'crm_lead_sources', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('crmLeadSources delete error:', error);
    res.status(500).json({ error: 'Failed to delete lead source' });
  }
});

export default router;

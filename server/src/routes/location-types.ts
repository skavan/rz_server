import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import { locationTypes, eq, asc, desc, and, ilike } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';
import { resolveSlug, SlugValidationError } from '../utils/slug.js';

const router = Router();

// GET /api/location-types
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { search, include_inactive, limit = '100', offset = '0', order = 'asc' } = req.query as any;

    const whereClauses: any[] = [];
    if (include_inactive !== 'true') {
      whereClauses.push(eq(locationTypes.isActive, true));
    }
    if (search) {
      whereClauses.push(ilike(locationTypes.name, `%${search}%`));
    }
    const where = whereClauses.length === 0
      ? undefined
      : whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses);

    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(locationTypes)
        .where(where)
        .orderBy(order === 'desc' ? desc(locationTypes.name) : asc(locationTypes.name))
        .limit(parseInt(limit))
        .offset(parseInt(offset));
    });

    res.json({ data: rows, meta: { count: rows.length } });
  } catch (error) {
    console.error('LocationTypes GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/location-types/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(locationTypes)
        .where(eq(locationTypes.id, parseInt(req.params.id)))
        .limit(1);
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Location type not found' });
    }

    res.json({ data: rows[0] });
  } catch (error) {
    console.error('LocationTypes GET by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/location-types
router.post('/', authenticateToken, autoInjectMiddleware('locationTypes'), async (req, res) => {
  try {
    const { name, slug, isActive, customerId } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    let slugValue: string;
    try {
      slugValue = resolveSlug(slug, name);
    } catch (err) {
      if (err instanceof SlugValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    const scope = getScopeFromRequest(req as any);
    const inserted = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(locationTypes)
        .values({
          customerId,
          name: String(name).trim(),
          slug: slugValue,
          isActive: isActive !== undefined ? !!isActive : true,
        })
        .returning();
    });

    const created = inserted[0];
    eventBus.broadcast({
      event: 'data_change:location_types',
      data: { type: 'create', resource: 'location_types', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.status(201).json({ data: created });
  } catch (error) {
    console.error('LocationTypes POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/location-types/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, isActive } = req.body || {};

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    let normalizedSlug: string | undefined;
    if (slug !== undefined || name !== undefined) {
      try {
        normalizedSlug = resolveSlug(slug, typeof name === 'string' && name.trim() ? name : undefined);
      } catch (err) {
        if (err instanceof SlugValidationError) {
          return res.status(err.status).json({ error: err.message });
        }
        throw err;
      }
    }

    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (normalizedSlug !== undefined) updates.slug = normalizedSlug;
    if (isActive !== undefined) updates.isActive = !!isActive;

    const scope = await getRequestScope(req as any);
    const updated = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .update(locationTypes)
        .set(updates)
        .where(eq(locationTypes.id, parseInt(id)))
        .returning();
    });

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Location type not found' });
    }

    const row = updated[0];
    eventBus.broadcast({
      event: 'data_change:location_types',
      data: { type: 'update', resource: 'location_types', resourceId: row.id, data: row },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: row });
  } catch (error) {
    console.error('LocationTypes PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/location-types/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const deleted = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(locationTypes)
        .where(eq(locationTypes.id, parseInt(req.params.id)))
        .returning();
    });

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Location type not found' });
    }

    const row = deleted[0];
    eventBus.broadcast({
      event: 'data_change:location_types',
      data: { type: 'delete', resource: 'location_types', resourceId: row.id, data: row },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ message: 'Location type deleted successfully', data: row });
  } catch (error) {
    console.error('LocationTypes DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

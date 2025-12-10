/**
 * Locations API - CRUD endpoints using Drizzle schema
 */
import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import { locations, eq, asc, desc, and, ilike } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';
import { resolveSlug, SlugValidationError } from '../utils/slug.js';

const router = Router();

// GET /api/locations
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { search, home_id, limit = '200', offset = '0', sort = 'name', order = 'asc' } = req.query as any;

    const where: any[] = [];
    if (home_id) where.push(eq(locations.homeId, parseInt(home_id)));
    if (search) where.push(ilike(locations.name, `%${search}%`));
    const whereClause = where.length === 0 ? undefined : (where.length === 1 ? where[0] : and(...where));

    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(locations)
        .where(whereClause)
        .orderBy(order === 'desc' ? desc(locations.name) : asc(locations.name))
        .limit(parseInt(limit))
        .offset(parseInt(offset));
    });

    res.json({ data: rows, meta: { count: rows.length } });
  } catch (e) {
    console.error('Locations GET error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/locations/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.select().from(locations).where(eq(locations.id, parseInt(id))).limit(1);
    });
    if (rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    res.json({ data: rows[0] });
  } catch (e) {
    console.error('Location GET by id error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/locations
router.post('/', authenticateToken, autoInjectMiddleware('locations'), async (req, res) => {
  try {
  const { homeId, name, slug, parentId, locationTypeId, squareFootage, isActive, cleaningCadence, checkingCadence, tags, lastChecked, lastCleaned, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const normalizedSlug = resolveSlug(slug, name);

    // homeId is now guaranteed by middleware
    const scope = getScopeFromRequest(req as any);
    const createdRows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(locations)
        .values({
          homeId: parseInt(homeId),
          name,
          slug: normalizedSlug,
          parentId: parentId ? parseInt(parentId) : null,
          locationTypeId: locationTypeId ? parseInt(locationTypeId) : null,
          squareFootage: squareFootage ? parseInt(squareFootage) : null,
          isActive: isActive !== undefined ? !!isActive : true,
          cleaningCadence: cleaningCadence || null,
          checkingCadence: checkingCadence || null,
          lastChecked: lastChecked ? new Date(lastChecked) : null,
          lastCleaned: lastCleaned ? new Date(lastCleaned) : null,
          notes: notes || null,
          tags: Array.isArray(tags) ? tags : null,
        })
        .returning();
    });
    const created = createdRows[0];
    eventBus.broadcast({
      event: 'data_change:locations',
      data: { type: 'create', resource: 'locations', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: created.homeId ? [created.homeId] : [] } },
    });
    res.status(201).json({ data: created });
  } catch (e) {
    if (e instanceof SlugValidationError) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error('Location POST error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/locations/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
  const { name, slug, parentId, locationType, locationTypeId, squareFootage, isActive, cleaningCadence, checkingCadence, tags, lastChecked, lastCleaned, notes } = req.body || {};
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) {
      updateData.name = name;
    }
    if (slug !== undefined || name !== undefined) {
      updateData.slug = resolveSlug(slug, typeof name === 'string' ? name : undefined);
    }
    if (parentId !== undefined) updateData.parentId = parentId ? parseInt(parentId) : null;
    if (locationType !== undefined) updateData.locationType = locationType || null;
    if (locationTypeId !== undefined) {
      updateData.locationTypeId = locationTypeId !== null && locationTypeId !== '' ? parseInt(locationTypeId) : null;
    }
    if (squareFootage !== undefined) updateData.squareFootage = squareFootage ? parseInt(squareFootage) : null;
    if (isActive !== undefined) updateData.isActive = !!isActive;
    if (cleaningCadence !== undefined) updateData.cleaningCadence = cleaningCadence || null;
    if (checkingCadence !== undefined) updateData.checkingCadence = checkingCadence || null;
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : null;
  if (lastChecked !== undefined) updateData.lastChecked = lastChecked ? new Date(lastChecked) : null;
  if (lastCleaned !== undefined) updateData.lastCleaned = lastCleaned ? new Date(lastCleaned) : null;
  if (notes !== undefined) updateData.notes = notes || null;

    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.update(locations).set(updateData).where(eq(locations.id, parseInt(id))).returning();
    });
    if (rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    const updated = rows[0];
    eventBus.broadcast({
      event: 'data_change:locations',
      data: { type: 'update', resource: 'locations', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: updated.homeId ? [updated.homeId] : [] } },
    });
    res.json({ data: updated });
  } catch (e) {
    if (e instanceof SlugValidationError) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error('Location PUT error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/locations/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb.delete(locations).where(eq(locations.id, parseInt(id))).returning();
    });
    if (rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    const deleted = rows[0];
    eventBus.broadcast({
      event: 'data_change:locations',
      data: { type: 'delete', resource: 'locations', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: deleted.homeId ? [deleted.homeId] : [] } },
    });
    res.json({ message: 'Location deleted successfully' });
  } catch (e) {
    console.error('Location DELETE error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

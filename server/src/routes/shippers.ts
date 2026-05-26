/**
 * Shippers API
 * Support table for shipping addresses with home scope
 */
import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import { shippers, eq, and, ilike } from '@skavan/rentalzen-drizzle';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { authenticateToken, optionalAuth } from '../auth/index.js';

const router = Router();

/**
 * GET /api/shippers
 * List shippers with optional filters
 * Query params: home_id, is_active, search, include_inactive
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { home_id, is_active, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereConditions: any[] = [eq(shippers.customerId, scope.customerId)];

      if (home_id) {
        whereConditions.push(eq(shippers.homeId, parseInt(home_id as string)));
      }

      if (is_active !== undefined) {
        whereConditions.push(eq(shippers.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        whereConditions.push(eq(shippers.isActive, true));
      }

      if (search && typeof search === 'string') {
        whereConditions.push(ilike(shippers.name, `%${search}%`));
      }

      return scopedDb
        .select()
        .from(shippers)
        .where(and(...whereConditions))
        .orderBy(shippers.name);
    });

    res.json({ data: results, count: results.length });
  } catch (error) {
    console.error('Shippers GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/shippers/:id
 * Get single shipper by ID
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(shippers)
        .where(and(eq(shippers.customerId, scope.customerId), eq(shippers.id, Number(id))))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Shipper not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Shipper GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/shippers
 * Create new shipper (requires auth)
 */
router.post('/', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { name, shipToName, street, city, state, zip, country, phone, contactIds, notes, homeId, isActive } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!homeId) {
      return res.status(400).json({ error: 'homeId is required' });
    }

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(shippers)
        .values({
          customerId: scope.customerId,
          homeId: Number(homeId),
          name: String(name).trim(),
          shipToName: shipToName ? String(shipToName).trim() : null,
          street: street ? String(street).trim() : null,
          city: city ? String(city).trim() : null,
          state: state ? String(state).trim() : null,
          zip: zip ? String(zip).trim() : null,
          country: country ? String(country).trim() : null,
          phone: phone ? String(phone).trim() : null,
          contactIds: Array.isArray(contactIds) ? contactIds.map((id: any) => parseInt(id)) : null,
          notes: notes ? String(notes).trim() : null,
          isActive: isActive !== undefined ? !!isActive : true,
        })
        .returning();
    });

    const created = results[0];
    eventBus.broadcast({
      event: 'data_change:shippers',
      data: { type: 'create', resource: 'shippers', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Shipper POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/shippers/:id
 * Update shipper (requires auth)
 */
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;
    const { name, shipToName, street, city, state, zip, country, phone, contactIds, notes, homeId, isActive } = req.body || {};

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: Record<string, any> = { updatedAt: new Date() };

      if (name !== undefined) updates.name = String(name).trim();
      if (shipToName !== undefined) updates.shipToName = shipToName ? String(shipToName).trim() : null;
      if (street !== undefined) updates.street = street ? String(street).trim() : null;
      if (city !== undefined) updates.city = city ? String(city).trim() : null;
      if (state !== undefined) updates.state = state ? String(state).trim() : null;
      if (zip !== undefined) updates.zip = zip ? String(zip).trim() : null;
      if (country !== undefined) updates.country = country ? String(country).trim() : null;
      if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
      if (contactIds !== undefined) updates.contactIds = Array.isArray(contactIds) ? contactIds.map((id: any) => parseInt(id)) : null;
      if (notes !== undefined) updates.notes = notes ? String(notes).trim() : null;
      if (homeId !== undefined) updates.homeId = Number(homeId);
      if (isActive !== undefined) updates.isActive = !!isActive;

      return scopedDb
        .update(shippers)
        .set(updates)
        .where(and(eq(shippers.customerId, scope.customerId), eq(shippers.id, Number(id))))
        .returning();
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Shipper not found' });
    }

    const updated = results[0];
    eventBus.broadcast({
      event: 'data_change:shippers',
      data: { type: 'update', resource: 'shippers', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: updated });
  } catch (error) {
    console.error('Shipper PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/shippers/:id
 * Delete shipper (requires auth)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(shippers)
        .where(and(eq(shippers.customerId, scope.customerId), eq(shippers.id, Number(id))))
        .returning();
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Shipper not found' });
    }

    const deleted = results[0];
    eventBus.broadcast({
      event: 'data_change:shippers',
      data: { type: 'delete', resource: 'shippers', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ message: 'Shipper deleted successfully', data: deleted });
  } catch (error) {
    console.error('Shipper DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

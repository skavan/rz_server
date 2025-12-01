import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { vendors, eq, and, ilike } from '@postgress/shared';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';
import { resolveSlug, SlugValidationError } from '../utils/slug.js';

const router = Router();

/**
 * GET /api/vendors
 * List all vendors with optional filters
 * Query params:
 *   - is_active: Filter by active status (true/false)
 *   - search: Search by name
 *   - include_inactive: Include inactive vendors (default: false)
 */
router.get('/', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { is_active, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereConditions = [eq(vendors.customerId, scope.customerId)];

      if (is_active !== undefined) {
        whereConditions.push(eq(vendors.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        whereConditions.push(eq(vendors.isActive, true));
      }

      if (search && typeof search === 'string') {
        whereConditions.push(ilike(vendors.name, `%${search}%`));
      }

      const whereClause = whereConditions.length === 0 ? undefined :
                         whereConditions.length === 1 ? whereConditions[0] :
                         and(...whereConditions);

      return scopedDb
        .select()
        .from(vendors)
        .where(whereClause)
        .orderBy(vendors.name);
    });

    res.json({ data: results, count: results.length });
  } catch (error) {
    console.error('Vendors GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/vendors/:id
 * Get single vendor by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(vendors)
        .where(and(eq(vendors.customerId, scope.customerId), eq(vendors.id, Number(id))))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Vendor GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/vendors
 * Create new vendor (requires auth)
 */
router.post('/', autoInjectMiddleware('vendors'), async (req, res) => {
  try {
    let { name, slug, websiteUrl, paymentTerms, isActive, customerId } = req.body || {};

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

    // customerId is now guaranteed by middleware
    const scope = getScopeFromRequest(req as any);
    const newVendors = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(vendors)
        .values({
          customerId,
          name,
          slug: slugValue,
          websiteUrl: websiteUrl || null,
          paymentTerms: paymentTerms || null,
          isActive: isActive !== undefined ? !!isActive : true
        })
        .returning();
    });

    const created = newVendors[0];
    eventBus.broadcast({
      event: 'data_change:vendors',
      data: { type: 'create', resource: 'vendors', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Vendor POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/vendors/:id
 * Update vendor (requires auth)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, websiteUrl, paymentTerms, isActive } = req.body || {};

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    let normalizedSlug: string | undefined;
    if (slug !== undefined) {
      if (!String(slug).trim()) {
        return res.status(400).json({ error: 'Slug cannot be empty' });
      }
      try {
        normalizedSlug = resolveSlug(slug, typeof name === 'string' && name.trim() ? name : undefined);
      } catch (err) {
        if (err instanceof SlugValidationError) {
          return res.status(err.status).json({ error: err.message });
        }
        throw err;
      }
    }

    const scope = await getRequestScope(req as any);
    const updatedVendors = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: any = { updatedAt: new Date() };

      if (name !== undefined) updates.name = name;
      if (normalizedSlug !== undefined) updates.slug = normalizedSlug;
      if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
      if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms;
      if (isActive !== undefined) updates.isActive = isActive;

      return scopedDb
        .update(vendors)
        .set(updates)
        .where(and(eq(vendors.customerId, scope.customerId), eq(vendors.id, Number(id))))
        .returning();
    });

    if (updatedVendors.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const updated = updatedVendors[0];
    eventBus.broadcast({
      event: 'data_change:vendors',
      data: { type: 'update', resource: 'vendors', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ data: updated });
  } catch (error) {
    console.error('Vendor PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/vendors/:id
 * Delete vendor (requires auth)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedVendors = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(vendors)
        .where(and(eq(vendors.customerId, scope.customerId), eq(vendors.id, Number(id))))
        .returning();
    });

    if (deletedVendors.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const deleted = deletedVendors[0];
    eventBus.broadcast({
      event: 'data_change:vendors',
      data: { type: 'delete', resource: 'vendors', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ message: 'Vendor deleted successfully', data: deleted });
  } catch (error) {
    console.error('Vendor DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

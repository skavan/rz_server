import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { brands, eq, and, ilike, or } from '@postgress/shared';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';

const router = Router();

/**
 * GET /api/brands
 * List all brands with optional filters
 * Query params:
 *   - is_active: Filter by active status (true/false)
 *   - search: Search by name
 *   - include_inactive: Include inactive brands (default: false)
 */
router.get('/', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { is_active, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      // Build WHERE conditions
      const whereConditions = [];

      // Filter by active status
      if (is_active !== undefined) {
        whereConditions.push(eq(brands.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        // Default: only show active brands
        whereConditions.push(eq(brands.isActive, true));
      }

      // Search by name
      if (search && typeof search === 'string') {
        whereConditions.push(ilike(brands.name, `%${search}%`));
      }

      // Build WHERE clause
      const whereClause = whereConditions.length === 0 ? undefined :
                         whereConditions.length === 1 ? whereConditions[0] :
                         and(...whereConditions);

      return scopedDb
        .select()
        .from(brands)
        .where(whereClause)
        .orderBy(brands.name);
    });

    res.json({ data: results, count: results.length });
  } catch (error) {
    console.error('Brands GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/brands/:id
 * Get single brand by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(brands)
        .where(eq(brands.id, Number(id)))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Brand GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Generate slug from name
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * POST /api/brands
 * Create new brand (requires auth)
 */
router.post('/', async (req, res) => {
  try {
    let { name, slug, websiteUrl, isActive } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Auto-generate slug if not provided
    if (!slug) {
      slug = generateSlug(name);
    }

    const scope = await getRequestScope(req as any);
    const newBrands = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(brands)
        .values({
          customerId: scope.customerId,
          name,
          slug,
          websiteUrl: websiteUrl || null,
          isActive: isActive !== undefined ? !!isActive : true
        })
        .returning();
    });

    const created = newBrands[0];
    eventBus.broadcast({
      event: 'data_change:brands',
      data: { type: 'create', resource: 'brands', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Brand POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/brands/:id
 * Update brand (requires auth)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, websiteUrl, isActive } = req.body || {};

    const scope = await getRequestScope(req as any);
    const updatedBrands = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: any = { updatedAt: new Date() };

      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = slug;
      if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
      if (isActive !== undefined) updates.isActive = isActive;

      return scopedDb
        .update(brands)
        .set(updates)
        .where(eq(brands.id, Number(id)))
        .returning();
    });

    if (updatedBrands.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const updated = updatedBrands[0];
    eventBus.broadcast({
      event: 'data_change:brands',
      data: { type: 'update', resource: 'brands', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ data: updated });
  } catch (error) {
    console.error('Brand PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/brands/:id
 * Delete brand (requires auth)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedBrands = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(brands)
        .where(eq(brands.id, Number(id)))
        .returning();
    });

    if (deletedBrands.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const deleted = deletedBrands[0];
    eventBus.broadcast({
      event: 'data_change:brands',
      data: { type: 'delete', resource: 'brands', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ message: 'Brand deleted successfully', data: deleted });
  } catch (error) {
    console.error('Brand DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { brands, eq, and, ilike, or } from '@postgress/shared';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { authenticateToken } from '../auth/index.js';
import { resolveSlug, SlugValidationError } from '../utils/slug.js';

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
      const whereConditions = [eq(brands.customerId, scope.customerId)];

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
 * POST /api/brands
 * Create new brand (requires auth)
 */
router.post('/', autoInjectMiddleware('brands', { requireWrite: true }), async (req, res) => {
  try {
    let { name, slug, websiteUrl, categoryIds, isActive, customerId } = req.body || {};

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
    const newBrands = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(brands)
        .values({
          customerId,
          name,
          slug: slugValue,
          websiteUrl: websiteUrl || null,
          categoryIds: categoryIds || null,
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
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, websiteUrl, categoryIds, isActive } = req.body || {};

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
    const updatedBrands = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: any = { updatedAt: new Date() };

      if (name !== undefined) updates.name = name;
      if (normalizedSlug !== undefined) updates.slug = normalizedSlug;
      if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
      if (categoryIds !== undefined) updates.categoryIds = categoryIds;
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
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
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

import { Router, Request, Response } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { categories, eq, and, like, isNull, desc, or, ilike } from '@postgress/shared';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { authenticateToken } from '../auth/index.js';
import { resolveSlug, SlugValidationError } from '../utils/slug.js';

const router = Router();

/**
 * GET /api/categories
 * List all categories with optional filters
 * Query params:
 *   - parent_id: Filter by parent category (use 'root' for top-level categories)
 *   - is_active: Filter by active status (true/false)
 *   - search: Search by name
 *   - include_inactive: Include inactive categories (default: false)
 */
router.get('/', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { parent_id, is_active, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      // Build WHERE conditions
      const whereConditions = [eq(categories.customerId, scope.customerId)];

      // Filter by parent ID
      if (parent_id === 'root') {
        whereConditions.push(isNull(categories.parentId));
      } else if (parent_id) {
        whereConditions.push(eq(categories.parentId, Number(parent_id)));
      }

      // Filter by active status
      if (is_active !== undefined) {
        whereConditions.push(eq(categories.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        // Default: only show active categories
        whereConditions.push(eq(categories.isActive, true));
      }

      // Search by name
      if (search && typeof search === 'string') {
        whereConditions.push(ilike(categories.name, `%${search}%`));
      }

      // Build WHERE clause
      const whereClause = whereConditions.length === 0 ? undefined :
                         whereConditions.length === 1 ? whereConditions[0] :
                         and(...whereConditions);

      return scopedDb
        .select()
        .from(categories)
        .where(whereClause)
        .orderBy(categories.name);
    });

    res.json({ data: results, count: results.length });
  } catch (error) {
    console.error('Categories GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/categories/:id
 * Get single category by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(categories)
        .where(and(eq(categories.customerId, scope.customerId), eq(categories.id, Number(id))))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Category GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/categories
 * Create new category (requires auth)
 */
router.post('/', autoInjectMiddleware('categories', { requireWrite: true }), async (req, res) => {
  try {
    let { name, slug, description, parentId, isActive, customerId } = req.body || {};

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
    const newCategories = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(categories)
        .values({
          customerId,
          name,
          slug: slugValue,
          description: description || null,
          parentId: parentId || null,
          isActive: isActive !== undefined ? !!isActive : true
        })
        .returning();
    });

    const created = newCategories[0];
    console.log('POST /api/categories - Success:', { id: created.id, name: created.name });
    
    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:categories',
      data: { type: 'create', resource: 'categories', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Category POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/categories/:id
 * Update category (requires auth)
 */
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, parentId, isActive } = req.body || {};

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
    const updatedCategories = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: any = {
        updatedAt: new Date()
      };

      if (name !== undefined) updates.name = name;
      if (normalizedSlug !== undefined) updates.slug = normalizedSlug;
      if (description !== undefined) updates.description = description;
      if (parentId !== undefined) updates.parentId = parentId;
      if (isActive !== undefined) updates.isActive = isActive;

      return scopedDb
        .update(categories)
        .set(updates)
        .where(and(eq(categories.customerId, scope.customerId), eq(categories.id, Number(id))))
        .returning();
    });

    if (updatedCategories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const updated = updatedCategories[0];
    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:categories',
      data: { type: 'update', resource: 'categories', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ data: updated });
  } catch (error) {
    console.error('Category PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/categories/:id
 * Delete category (requires auth)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedCategories = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(categories)
        .where(and(eq(categories.customerId, scope.customerId), eq(categories.id, Number(id))))
        .returning();
    });

    if (deletedCategories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const deleted = deletedCategories[0];
    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:categories',
      data: { type: 'delete', resource: 'categories', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ message: 'Category deleted successfully', data: deleted });
  } catch (error) {
    console.error('Category DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

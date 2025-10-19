import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { tags, eq, and, ilike } from '@postgress/shared';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';

const router = Router();

/**
 * GET /api/tags
 * List all tags with optional filters
 * Query params:
 *   - is_active: Filter by active status (true/false)
 *   - tag_type: Filter by tag type (category, status, feature, material, project)
 *   - tag_scope: Filter by tag scope (product, sku, inventory_item, location, home, all)
 *   - is_system: Filter system tags (true/false)
 *   - search: Search by name
 *   - include_inactive: Include inactive tags (default: false)
 */
router.get('/', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { is_active, tag_type, tag_scope, is_system, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereConditions = [];

      if (is_active !== undefined) {
        whereConditions.push(eq(tags.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        whereConditions.push(eq(tags.isActive, true));
      }

      if (tag_type) {
        whereConditions.push(eq(tags.tagType, tag_type as any));
      }

      if (tag_scope) {
        whereConditions.push(eq(tags.tagScope, tag_scope as any));
      }

      if (is_system !== undefined) {
        whereConditions.push(eq(tags.isSystem, is_system === 'true'));
      }

      if (search && typeof search === 'string') {
        whereConditions.push(ilike(tags.name, `%${search}%`));
      }

      const whereClause = whereConditions.length === 0 ? undefined :
                         whereConditions.length === 1 ? whereConditions[0] :
                         and(...whereConditions);

      return scopedDb
        .select()
        .from(tags)
        .where(whereClause)
        .orderBy(tags.name);
    });

    res.json({ data: results, count: results.length });
  } catch (error) {
    console.error('Tags GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tags/:id
 * Get single tag by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(tags)
        .where(eq(tags.id, Number(id)))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Tag GET by ID error:', error);
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
 * POST /api/tags
 * Create new tag (requires auth)
 */
router.post('/', autoInjectMiddleware('tags'), async (req, res) => {
  try {
    let { 
      name, slug, description, color, tagType, tagScope, 
      isSystem, locked, isActive, customerId 
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Auto-generate slug if not provided
    if (!slug) {
      slug = generateSlug(name);
    }

    // customerId is now guaranteed by middleware
    const scope = getScopeFromRequest(req as any);
    const newTags = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(tags)
        .values({
          customerId,
          name,
          slug,
          description: description || null,
          color: color || null,
          tagType: tagType || null,
          tagScope: tagScope || null,
          isSystem: isSystem !== undefined ? !!isSystem : false,
          locked: locked !== undefined ? !!locked : false,
          isActive: isActive !== undefined ? !!isActive : true
        })
        .returning();
    });

    const created = newTags[0];
    eventBus.broadcast({
      event: 'data_change:tags',
      data: { type: 'create', resource: 'tags', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Tag POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/tags/:id
 * Update tag (requires auth)
 * Note: System tags and locked tags may have restrictions
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, slug, description, color, tagType, tagScope, 
      locked, isActive 
    } = req.body || {};

    const scope = await getRequestScope(req as any);
    const updatedTags = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      // First check if tag is locked
      const existing = await scopedDb
        .select()
        .from(tags)
        .where(eq(tags.id, Number(id)))
        .limit(1);

      if (existing.length > 0 && existing[0].locked) {
        throw new Error('Cannot modify locked tag');
      }

      const updates: any = { updatedAt: new Date() };

      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = slug;
      if (description !== undefined) updates.description = description;
      if (color !== undefined) updates.color = color;
      if (tagType !== undefined) updates.tagType = tagType;
      if (tagScope !== undefined) updates.tagScope = tagScope;
      if (locked !== undefined) updates.locked = locked;
      if (isActive !== undefined) updates.isActive = isActive;

      return scopedDb
        .update(tags)
        .set(updates)
        .where(eq(tags.id, Number(id)))
        .returning();
    });

    if (updatedTags.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const updated = updatedTags[0];
    eventBus.broadcast({
      event: 'data_change:tags',
      data: { type: 'update', resource: 'tags', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ data: updated });
  } catch (error) {
    console.error('Tag PUT error:', error);
    if (error instanceof Error && error.message === 'Cannot modify locked tag') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/tags/:id
 * Delete tag (requires auth)
 * Note: System tags and locked tags cannot be deleted
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedTags = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      // First check if tag is locked or system
      const existing = await scopedDb
        .select()
        .from(tags)
        .where(eq(tags.id, Number(id)))
        .limit(1);

      if (existing.length > 0 && (existing[0].locked || existing[0].isSystem)) {
        throw new Error('Cannot delete system or locked tag');
      }

      return scopedDb
        .delete(tags)
        .where(eq(tags.id, Number(id)))
        .returning();
    });

    if (deletedTags.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const deleted = deletedTags[0];
    eventBus.broadcast({
      event: 'data_change:tags',
      data: { type: 'delete', resource: 'tags', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ message: 'Tag deleted successfully', data: deleted });
  } catch (error) {
    console.error('Tag DELETE error:', error);
    if (error instanceof Error && error.message === 'Cannot delete system or locked tag') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

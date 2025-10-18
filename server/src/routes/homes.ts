import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { homes, eq, and, ilike } from '@postgress/shared';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';

const router = Router();

/**
 * GET /api/homes
 * List all homes with optional filters
 * Query params:
 *   - is_active: Filter by active status (true/false)
 *   - property_type: Filter by property type
 *   - search: Search by name or address
 *   - include_inactive: Include inactive homes (default: false)
 */
router.get('/', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { is_active, property_type, search, include_inactive } = req.query;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereConditions = [];

      if (is_active !== undefined) {
        whereConditions.push(eq(homes.isActive, is_active === 'true'));
      } else if (include_inactive !== 'true') {
        whereConditions.push(eq(homes.isActive, true));
      }

      if (property_type) {
        whereConditions.push(eq(homes.propertyType, property_type as string));
      }

      if (search && typeof search === 'string') {
        whereConditions.push(ilike(homes.name, `%${search}%`));
      }

      const whereClause = whereConditions.length === 0 ? undefined :
                         whereConditions.length === 1 ? whereConditions[0] :
                         and(...whereConditions);

      return scopedDb
        .select()
        .from(homes)
        .where(whereClause)
        .orderBy(homes.name);
    });

    res.json({ data: results, count: results.length });
  } catch (error) {
    console.error('Homes GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/homes/:id
 * Get single home by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { id } = req.params;

    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(homes)
        .where(eq(homes.id, Number(id)))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }

    res.json({ data: results[0] });
  } catch (error) {
    console.error('Home GET by ID error:', error);
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
 * POST /api/homes
 * Create new home (requires auth)
 */
router.post('/', async (req, res) => {
  try {
    let { 
      name, slug, address, propertyType, bedrooms, bathrooms, 
      squareFootage, description, notes, isActive 
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Auto-generate slug if not provided
    if (!slug) {
      slug = generateSlug(name);
    }

    const scope = await getRequestScope(req as any);
    const newHomes = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(homes)
        .values({
          customerId: scope.customerId,
          name,
          slug,
          address: address || null,
          propertyType: propertyType || null,
          bedrooms: bedrooms || null,
          bathrooms: bathrooms || null,
          squareFootage: squareFootage || null,
          description: description || null,
          notes: notes || null,
          isActive: isActive !== undefined ? !!isActive : true
        })
        .returning();
    });

    const created = newHomes[0];
    eventBus.broadcast({
      event: 'data_change:homes',
      data: { type: 'create', resource: 'homes', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Home POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/homes/:id
 * Update home (requires auth)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, slug, address, propertyType, bedrooms, bathrooms, 
      squareFootage, description, notes, isActive 
    } = req.body || {};

    const scope = await getRequestScope(req as any);
    const updatedHomes = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const updates: any = { updatedAt: new Date() };

      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = slug;
      if (address !== undefined) updates.address = address;
      if (propertyType !== undefined) updates.propertyType = propertyType;
      if (bedrooms !== undefined) updates.bedrooms = bedrooms;
      if (bathrooms !== undefined) updates.bathrooms = bathrooms;
      if (squareFootage !== undefined) updates.squareFootage = squareFootage;
      if (description !== undefined) updates.description = description;
      if (notes !== undefined) updates.notes = notes;
      if (isActive !== undefined) updates.isActive = isActive;

      return scopedDb
        .update(homes)
        .set(updates)
        .where(eq(homes.id, Number(id)))
        .returning();
    });

    if (updatedHomes.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }

    const updated = updatedHomes[0];
    eventBus.broadcast({
      event: 'data_change:homes',
      data: { type: 'update', resource: 'homes', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: [updated.id] } }
    });

    res.json({ data: updated });
  } catch (error) {
    console.error('Home PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/homes/:id
 * Delete home (requires auth)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedHomes = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(homes)
        .where(eq(homes.id, Number(id)))
        .returning();
    });

    if (deletedHomes.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }

    const deleted = deletedHomes[0];
    eventBus.broadcast({
      event: 'data_change:homes',
      data: { type: 'delete', resource: 'homes', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId, homeIds: [deleted.id] } }
    });

    res.json({ message: 'Home deleted successfully', data: deleted });
  } catch (error) {
    console.error('Home DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

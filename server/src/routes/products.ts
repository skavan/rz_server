/**
 * Products API - Clean Drizzle Implementation
 */
import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { products, eq, ilike, or, asc, desc, and, ne, sql } from '@postgress/shared';
// Import productComponents if available in shared schema; fallback to raw SQL if not.
// @ts-ignore - will be resolved by shared package at build time
import { productComponents } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';

const router = Router();

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate unique slug for a home, avoiding conflicts with existing products
 */
async function generateUniqueSlug(scopedDb: any, name: string, homeId: number, excludeProductId?: number): Promise<string> {
  const baseSlug = generateSlug(name);
  
  // Check if base slug is available
  const existing = await scopedDb
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.homeId, homeId),
        eq(products.slug, baseSlug),
        excludeProductId ? ne(products.id, excludeProductId) : undefined
      )
    )
    .limit(1);
  
  if (existing.length === 0) {
    return baseSlug;
  }
  
  // Find next available number
  let counter = 2;
  while (true) {
    const numberedSlug = `${baseSlug}-${counter}`;
    const existingNumbered = await scopedDb
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.homeId, homeId),
          eq(products.slug, numberedSlug),
          excludeProductId ? ne(products.id, excludeProductId) : undefined
        )
      )
      .limit(1);
    
    if (existingNumbered.length === 0) {
      return numberedSlug;
    }
    counter++;
  }
}

/**
 * GET /api/products
 * Get all products with optional filtering
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      category_id,
      home_id,
      search,
      is_visible,
      limit = '50',
      offset = '0',
      sort = 'name',
      order = 'asc'
    } = req.query;

    // Build WHERE conditions
    const whereConditions = [];
    
    if (category_id) {
      whereConditions.push(eq(products.categoryId, parseInt(category_id as string)));
    }
    if (home_id) {
      whereConditions.push(eq(products.homeId, parseInt(home_id as string)));
    }
    if (is_visible !== undefined) {
      whereConditions.push(eq(products.isVisible, is_visible === 'true'));
    }
    if (search) {
      whereConditions.push(
        or(
          ilike(products.name, `%${search}%`),
          ilike(products.notes, `%${search}%`)
        )
      );
    }

    // Build WHERE clause
    const whereClause = whereConditions.length === 0 ? undefined : 
                       whereConditions.length === 1 ? whereConditions[0] : 
                       and(...whereConditions);

    // Build ORDER BY
    const sortColumn = sort === 'name' ? products.name : products.createdAt;
    const orderBy = order === 'desc' ? desc(sortColumn) : asc(sortColumn);

    // Execute within tenant scope so RLS GUCs and app role are applied
    const scope = await getRequestScope(req as any);
    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(products)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));
    });

    res.json({
      data: results,
      meta: {
        count: results.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });

  } catch (error: any) {
    console.error('Products GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/products/:id
 * Get single product by ID
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(products)
        .where(eq(products.id, parseInt(id)))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ data: results[0] });

  } catch (error) {
    console.error('Product GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/products
 * Create new product (requires auth)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
  const { name, homeId, categoryId, notes, isVisible, isActive, isKit, tags, checkCadence } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    if (!homeId) {
      return res.status(400).json({ error: 'Home ID is required' });
    }

    const scope = await getRequestScope(req as any);
  const newProducts = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      // Generate unique slug from name
      const slug = await generateUniqueSlug(scopedDb, name, parseInt(homeId));
      return scopedDb
        .insert(products)
        .values({
          name,
          slug,
          homeId: parseInt(homeId),
          categoryId: categoryId ? parseInt(categoryId) : null,
      notes: notes || null,
      isVisible: isVisible !== undefined ? !!isVisible : true,
      isActive: isActive !== undefined ? !!isActive : true,
      // Optional fields if present in schema
      ...(isKit !== undefined ? { isKit: !!isKit } : {}),
      ...(checkCadence !== undefined ? { checkCadence: checkCadence || null } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
        })
        .returning();
    });

    const created = newProducts[0];
    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'create', resource: 'products', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: created.homeId ? [created.homeId] : [] } }
    });
    res.status(201).json({ data: created });

  } catch (error) {
    console.error('Product POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/products/composite
 * Create a product and its components in a single transaction
 * Body: { product: { name, homeId, categoryId?, notes?, isComposite? }, components?: [{ componentProductId, quantity, isRequired?, sortOrder? }] }
 */
router.post('/composite', authenticateToken, async (req, res) => {
  try {
    const { product: productInput, components = [] } = req.body || {};
    if (!productInput?.name) return res.status(400).json({ error: 'Product name is required' });
    if (!productInput?.homeId) return res.status(400).json({ error: 'Home ID is required' });

    const scope = await getRequestScope(req as any);
    const created = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb, client) => {
      // Create product first
      const slug = generateSlug(productInput.name);
      const newProducts = await scopedDb
        .insert(products)
        .values({
          name: productInput.name,
          slug,
          homeId: parseInt(productInput.homeId),
          categoryId: productInput.categoryId ? parseInt(productInput.categoryId) : null,
          notes: productInput.notes || null,
          isVisible: productInput.isVisible !== undefined ? !!productInput.isVisible : true,
          isActive: productInput.isActive !== undefined ? !!productInput.isActive : true,
          // Optional fields if present in schema
          ...(productInput.isKit !== undefined
            ? { isKit: !!productInput.isKit }
            : { isKit: Array.isArray(components) && components.length > 0 ? true : undefined } as any),
          ...(productInput.checkCadence !== undefined ? { checkCadence: productInput.checkCadence || null } : {}),
          ...(Array.isArray(productInput.tags) ? { tags: productInput.tags } : {}),
        })
        .returning();
      const createdProduct = newProducts[0];

      // If components provided, insert them
      if (Array.isArray(components) && components.length > 0) {
        // Prefer Drizzle schema if available, else raw SQL
        if (productComponents) {
          const rows = components.map((c: any, idx: number) => ({
            parentProductId: createdProduct.id,
            componentProductId: parseInt(c.componentProductId),
            quantity: Number(c.quantity) || 1,
            isRequired: c.isRequired !== undefined ? !!c.isRequired : true,
            sortOrder: c.sortOrder !== undefined ? Number(c.sortOrder) : idx,
          }));
          await scopedDb.insert(productComponents).values(rows);
        } else {
          // Raw SQL fallback
          for (let i = 0; i < components.length; i++) {
            const c = components[i];
            await client.query(
              'INSERT INTO product_components (parent_product_id, component_product_id, quantity, is_required, sort_order) VALUES ($1, $2, $3, $4, $5)',
              [createdProduct.id, parseInt(c.componentProductId), Number(c.quantity) || 1, c.isRequired !== undefined ? !!c.isRequired : true, c.sortOrder !== undefined ? Number(c.sortOrder) : i]
            );
          }
        }
      }

      return createdProduct;
    });

    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'create', resource: 'products', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: created.homeId ? [created.homeId] : [] } }
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    console.error('Product composite POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/products/:id
 * Update product (requires auth)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
  const { name, categoryId, notes, isVisible, isActive, isKit, tags, checkCadence } = req.body || {};

    const updateData: any = {
      updatedAt: new Date()
    };

    if (categoryId !== undefined) {
      updateData.categoryId = categoryId ? parseInt(categoryId) : null;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (isVisible !== undefined) {
      updateData.isVisible = isVisible;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    if (isKit !== undefined) {
      (updateData as any).isKit = !!isKit;
    }
    if (tags !== undefined) {
      (updateData as any).tags = Array.isArray(tags) ? tags : null;
    }
    if (checkCadence !== undefined) {
      (updateData as any).checkCadence = checkCadence || null;
    }

    const scope = await getRequestScope(req as any);
    const updatedProducts = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      if (name !== undefined) {
        // Get the current product's home_id for unique slug generation
        const currentProduct = await scopedDb
          .select({ homeId: products.homeId })
          .from(products)
          .where(eq(products.id, parseInt(id)))
          .limit(1);
        
        if (currentProduct.length === 0) {
          throw new Error('Product not found');
        }
        
        updateData.name = name;
        updateData.slug = await generateUniqueSlug(scopedDb, name, currentProduct[0].homeId, parseInt(id));
      }
      return scopedDb
        .update(products)
        .set(updateData)
        .where(eq(products.id, parseInt(id)))
        .returning();
    });

    if (updatedProducts.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updated = updatedProducts[0];
    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'update', resource: 'products', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: updated.homeId ? [updated.homeId] : [] } }
    });
    res.json({ data: updated });

  } catch (error) {
    console.error('Product PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/products/:id
 * Delete product (requires auth)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedProducts = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb, client) => {
      // Note: product_components has CASCADE DELETE in schema, so they'll be auto-deleted
      
      // Guard 1: block if product is used as a component in other kits
      try {
        const usedRows = productComponents
          ? await scopedDb.select({ id: (productComponents as any).id }).from(productComponents).where(eq((productComponents as any).componentProductId, parseInt(id))).limit(1)
          : (await client.query('SELECT id FROM product_components WHERE component_product_id = $1 LIMIT 1', [parseInt(id)])).rows;
        if (usedRows && usedRows.length > 0) {
          throw Object.assign(new Error('Cannot delete product used in other kits'), { status: 400, code: 'USED_IN_KITS' });
        }
      } catch (e) {
        if ((e as any)?.code === 'USED_IN_KITS') throw e;
      }

      // Guard 2: block if product has inventory items
      try {
        const invRows = await client.query('SELECT id FROM inventory_items WHERE product_id = $1 LIMIT 1', [parseInt(id)]);
        if (invRows?.rows?.length > 0) {
          throw Object.assign(new Error('Cannot delete product with inventory items'), { status: 400, code: 'HAS_INVENTORY' });
        }
      } catch (e) {
        if ((e as any)?.code === 'HAS_INVENTORY') throw e;
      }

      // Proceed with delete (cascade will handle product_components cleanup)
      return scopedDb
        .delete(products)
        .where(eq(products.id, parseInt(id)))
        .returning();
    });

    if (deletedProducts.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const deleted = deletedProducts[0];
    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'delete', resource: 'products', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: deleted.homeId ? [deleted.homeId] : [] } }
    });
    res.json({ message: 'Product deleted successfully' });

  } catch (error: any) {
    console.error('Product DELETE error:', error);
    if (error?.code === 'USED_IN_KITS' || error?.code === 'HAS_INVENTORY') {
      return res.status(error.status || 400).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/products/:id/composite
 * Update product and replace its components in a single transaction
 * Body: { product?: { name?, categoryId?, notes?, isVisible?, isActive? }, components?: [{ componentProductId, quantity, isRequired?, sortOrder? }] }
 */
router.put('/:id/composite', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { product: productInput = {}, components = [] } = req.body || {};

    const scope = await getRequestScope(req as any);
    const updated = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb, client) => {
      // Update product if fields provided
      if (productInput && Object.keys(productInput).length > 0) {
        const updateData: any = { updatedAt: new Date() };
        if (productInput.name !== undefined) {
          // Get the current product's home_id for unique slug generation
          const currentProduct = await scopedDb
            .select({ homeId: products.homeId })
            .from(products)
            .where(eq(products.id, parseInt(id)))
            .limit(1);
          
          if (currentProduct.length === 0) {
            throw new Error('Product not found');
          }
          
          updateData.name = productInput.name;
          updateData.slug = await generateUniqueSlug(scopedDb, productInput.name, currentProduct[0].homeId, parseInt(id));
        }
        if (productInput.categoryId !== undefined) {
          updateData.categoryId = productInput.categoryId ? parseInt(productInput.categoryId) : null;
        }
        if (productInput.notes !== undefined) {
          updateData.notes = productInput.notes;
        }
        if (productInput.isVisible !== undefined) {
          updateData.isVisible = !!productInput.isVisible;
        }
        if (productInput.isActive !== undefined) {
          updateData.isActive = !!productInput.isActive;
        }
        if (productInput.isKit !== undefined) {
          (updateData as any).isKit = !!productInput.isKit;
        }
        if (productInput.tags !== undefined) {
          (updateData as any).tags = Array.isArray(productInput.tags) ? productInput.tags : null;
        }

        await scopedDb.update(products).set(updateData).where(eq(products.id, parseInt(id))).returning();
      }

      // Replace components: delete existing and insert new
      // Prefer Drizzle schema if available, else raw SQL
      if (productComponents) {
        // delete existing
        await scopedDb.delete(productComponents).where(eq((productComponents as any).parentProductId, parseInt(id)));
        if (Array.isArray(components) && components.length > 0) {
          const rows = components.map((c: any, idx: number) => ({
            parentProductId: parseInt(id),
            componentProductId: parseInt(c.componentProductId),
            quantity: Number(c.quantity) || 1,
            isRequired: c.isRequired !== undefined ? !!c.isRequired : true,
            sortOrder: c.sortOrder !== undefined ? Number(c.sortOrder) : idx,
            notes: c.notes ?? null,  // ✅ ADD THIS LINE
          }));
          await scopedDb.insert(productComponents).values(rows);
        }
      } else {
        // Raw SQL fallback
        await client.query('DELETE FROM product_components WHERE parent_product_id = $1', [parseInt(id)]);
        for (let i = 0; i < components.length; i++) {
          const c = components[i];
          await client.query(
            'INSERT INTO product_components (parent_product_id, component_product_id, quantity, is_required, sort_order) VALUES ($1, $2, $3, $4, $5)',
            [parseInt(id), parseInt(c.componentProductId), Number(c.quantity) || 1, c.isRequired !== undefined ? !!c.isRequired : true, c.sortOrder !== undefined ? Number(c.sortOrder) : i]
          );
        }
      }

      // Return the updated product
      const rows = await scopedDb.select().from(products).where(eq(products.id, parseInt(id))).limit(1);
      return rows[0];
    });

    if (!updated) return res.status(404).json({ error: 'Product not found' });

    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'update', resource: 'products', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: updated.homeId ? [updated.homeId] : [] } }
    });

    res.json({ data: updated });
  } catch (error: any) {
    console.error('Product composite PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

/**
 * SKUs API - Clean Drizzle Implementation with Component Support
 * Note: SKUs are customer-scoped catalog items (no homeId)
 */
import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import { skus, eq, ilike, or, asc, desc, and, ne } from '@postgress/shared';
// Import skuComponents if available in shared schema; fallback to raw SQL if not.
// @ts-ignore - will be resolved by shared package at build time
import { skuComponents } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';
import { resolveSlug, SlugValidationError } from '../utils/slug.js';
import { parsePagination, parseOptionalBoolean, parseOptionalDecimal } from './shared/validation.js';

const router = Router();

/**
 * Generate unique slug for customer, avoiding conflicts with existing SKUs
 */
async function generateUniqueSlug(
  scopedDb: any,
  rawSlug: unknown,
  fallbackName: string,
  customerId: number,
  excludeSkuId?: number
): Promise<string> {
  const baseSlug = resolveSlug(rawSlug, fallbackName);
  
  // Check if base slug is available
  const existing = await scopedDb
    .select({ id: skus.id })
    .from(skus)
    .where(
      and(
        eq(skus.customerId, customerId),
        eq(skus.slug, baseSlug),
        excludeSkuId ? ne(skus.id, excludeSkuId) : undefined
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
      .select({ id: skus.id })
      .from(skus)
      .where(
        and(
          eq(skus.customerId, customerId),
          eq(skus.slug, numberedSlug),
          excludeSkuId ? ne(skus.id, excludeSkuId) : undefined
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
 * GET /api/skus
 * Get all SKUs with optional filtering
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      product_id,
      brand_id,
      vendor_id,
      search,
      status,
      sort = 'name',
      order = 'asc'
    } = req.query;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset);

    // Build WHERE conditions
    const whereConditions = [];
    
    if (product_id) {
      whereConditions.push(eq(skus.productId, parseInt(product_id as string)));
    }
    if (brand_id) {
      whereConditions.push(eq(skus.brandId, parseInt(brand_id as string)));
    }
    if (vendor_id) {
      whereConditions.push(eq(skus.vendorId, parseInt(vendor_id as string)));
    }
    if (status && ['active', 'discontinued', 'unknown'].includes(status as string)) {
      whereConditions.push(eq(skus.status, status as any));
    }
    if (search) {
      whereConditions.push(
        or(
          ilike(skus.name, `%${search}%`),
          ilike(skus.notes, `%${search}%`),
          ilike(skus.vendorSku, `%${search}%`)
        )
      );
    }

    // Build WHERE clause
    const whereClause = whereConditions.length === 0 ? undefined : 
                       whereConditions.length === 1 ? whereConditions[0] : 
                       and(...whereConditions);

    // Build ORDER BY
    const sortColumn = sort === 'name' ? skus.name : skus.createdAt;
    const orderBy = order === 'desc' ? desc(sortColumn) : asc(sortColumn);

    // Execute within tenant scope
    const scope = await getRequestScope(req as any);
    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(skus)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    });

    res.json({
      data: results,
      meta: {
        count: results.length,
        limit,
        offset
      }
    });

  } catch (error: any) {
    console.error('SKUs GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/skus/:id
 * Get single SKU by ID
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(skus)
        .where(eq(skus.id, parseInt(id)))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    res.json({ data: results[0] });

  } catch (error) {
    console.error('SKU GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/skus
 * Create new SKU (requires auth)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, slug, productId, vendorId, brandId, vendorSku, purchaseUrl, price, estRepairPrice, isPurchasable, currency, lifespanYears, notes, status, kind, tags } = req.body || {};
    const isImportValue = parseOptionalBoolean(req.body?.isImport ?? req.body?.is_import, 'isImport');

    if (!name) {
      return res.status(400).json({ error: 'SKU name is required' });
    }

    const scope = await getRequestScope(req as any);
    const newSkus = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const normalizedSlug = await generateUniqueSlug(scopedDb, slug, name, scope.customerId);
      const estRepairPriceValue = parseOptionalDecimal(
        estRepairPrice ?? (req.body?.est_repair_price as unknown),
        'estRepairPrice'
      );
      return scopedDb
        .insert(skus)
        .values({
          customerId: scope.customerId,
          name,
          slug: normalizedSlug,
          productId: productId ? parseInt(productId) : null,
          vendorId: vendorId ? parseInt(vendorId) : null,
          brandId: brandId ? parseInt(brandId) : null,
          vendorSku: vendorSku || null,
          purchaseUrl: purchaseUrl || null,
          price: price || null,
          estRepairPrice: estRepairPriceValue ?? null,
          isPurchasable: isPurchasable !== undefined ? !!isPurchasable : true,
          currency: currency || 'USD',
          lifespanYears: lifespanYears ? parseInt(lifespanYears) : null,
          notes: notes || null,
          status: status || 'active',
          ...(isImportValue !== undefined ? { isImport: isImportValue } : {}),
          ...(kind !== undefined ? { kind } : {}),
          ...(Array.isArray(tags) ? { tags } : {}),
        })
        .returning();
    });

    const created = newSkus[0];
    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:skus',
      data: { type: 'create', resource: 'skus', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    res.status(201).json({ data: created });

  } catch (error) {
    if (error instanceof SlugValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('SKU POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/skus/composite
 * Create a SKU and its components in a single transaction
 * Body: { sku: { name, productId?, ... }, components?: [{ componentSkuId, quantity, isRequired?, sortOrder?, costAllocation? }] }
 */
router.post('/composite', authenticateToken, async (req, res) => {
  try {
    const { sku: skuInput, components: componentsRaw, bomItems } = req.body || {};
    const components = componentsRaw ?? bomItems ?? [];
    if (!skuInput?.name) return res.status(400).json({ error: 'SKU name is required' });

    const scope = await getRequestScope(req as any);
    const created = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb, client) => {
      // Create SKU first
  const slug = await generateUniqueSlug(scopedDb, skuInput?.slug, skuInput.name, scope.customerId);
      const isImportValue = parseOptionalBoolean(skuInput?.isImport ?? skuInput?.is_import, 'isImport');
      const estRepairPriceValue = parseOptionalDecimal(
        skuInput?.estRepairPrice ?? skuInput?.est_repair_price,
        'estRepairPrice'
      );
      const newSkus = await scopedDb
        .insert(skus)
        .values({
          customerId: scope.customerId,
          name: skuInput.name,
          slug,
          productId: skuInput.productId ? parseInt(skuInput.productId) : null,
          vendorId: skuInput.vendorId ? parseInt(skuInput.vendorId) : null,
          brandId: skuInput.brandId ? parseInt(skuInput.brandId) : null,
          vendorSku: skuInput.vendorSku || null,
          purchaseUrl: skuInput.purchaseUrl || null,
          price: skuInput.price || null,
          estRepairPrice: estRepairPriceValue ?? null,
          isPurchasable: skuInput.isPurchasable !== undefined ? !!skuInput.isPurchasable : true,
          currency: skuInput.currency || 'USD',
          lifespanYears: skuInput.lifespanYears ? parseInt(skuInput.lifespanYears) : null,
          notes: skuInput.notes || null,
          status: skuInput.status || 'active',
          ...(isImportValue !== undefined ? { isImport: isImportValue } : {}),
          ...(skuInput.kind !== undefined
            ? { kind: skuInput.kind }
            : { kind: Array.isArray(components) && components.length > 0 ? 'bom' : 'simple' } as any),
          ...(Array.isArray(skuInput.tags) ? { tags: skuInput.tags } : {}),
        })
        .returning();
      const createdSku = newSkus[0];

      // If components provided, insert them
      if (Array.isArray(components) && components.length > 0) {
        if (skuComponents) {
          const rows = components.map((c: any, idx: number) => ({
            parentSkuId: createdSku.id,
            componentSkuId: parseInt(c.componentSkuId),
            quantity: Number(c.quantity) || 1,
            isRequired: c.isRequired !== undefined ? !!c.isRequired : true,
            sortOrder: c.sortOrder !== undefined ? Number(c.sortOrder) : idx,
            costAllocation: c.costAllocation !== undefined ? Number(c.costAllocation) : null,
          }));
          await scopedDb.insert(skuComponents).values(rows);
        } else {
          // Raw SQL fallback
          for (let i = 0; i < components.length; i++) {
            const c = components[i];
            await client.query(
              'INSERT INTO sku_components (parent_sku_id, component_sku_id, quantity, is_required, sort_order, cost_allocation) VALUES ($1, $2, $3, $4, $5, $6)',
              [createdSku.id, parseInt(c.componentSkuId), Number(c.quantity) || 1, c.isRequired !== undefined ? !!c.isRequired : true, c.sortOrder !== undefined ? Number(c.sortOrder) : i, c.costAllocation !== undefined ? Number(c.costAllocation) : null]
            );
          }
        }
      }

      return createdSku;
    });

    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:skus',
      data: { type: 'create', resource: 'skus', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof SlugValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('SKU composite POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/skus/:id
 * Update SKU (requires auth)
 */
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
  const { id } = req.params;
  const { name, slug, productId, vendorId, brandId, vendorSku, purchaseUrl, price, estRepairPrice, isPurchasable, currency, lifespanYears, notes, status, kind, tags } = req.body || {};
  const isImportValue = parseOptionalBoolean(req.body?.isImport ?? req.body?.is_import, 'isImport');

    const updateData: any = {
      updatedAt: new Date()
    };

    if (productId !== undefined) {
      updateData.productId = productId ? parseInt(productId) : null;
    }
    if (vendorId !== undefined) {
      updateData.vendorId = vendorId ? parseInt(vendorId) : null;
    }
    if (brandId !== undefined) {
      updateData.brandId = brandId ? parseInt(brandId) : null;
    }
    if (vendorSku !== undefined) {
      updateData.vendorSku = vendorSku;
    }
    if (purchaseUrl !== undefined) {
      updateData.purchaseUrl = purchaseUrl;
    }
    if (price !== undefined) {
      updateData.price = price;
      if (!('priceUpdated' in req.body)) {
        updateData.priceUpdated = new Date();
      }
    }
    const hasEstRepairPriceField =
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'estRepairPrice') ||
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'est_repair_price');
    if (hasEstRepairPriceField) {
      updateData.estRepairPrice = parseOptionalDecimal(
        estRepairPrice ?? (req.body?.est_repair_price as unknown),
        'estRepairPrice'
      );
    }
    if (req.body.priceUpdated !== undefined) {
      updateData.priceUpdated = req.body.priceUpdated ? new Date(req.body.priceUpdated) : null;
    }
    if (isPurchasable !== undefined) {
      updateData.isPurchasable = isPurchasable;
    }
    if (currency !== undefined) {
      updateData.currency = currency;
    }
    if (lifespanYears !== undefined) {
      updateData.lifespanYears = lifespanYears ? parseInt(lifespanYears) : null;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (status !== undefined && ['active', 'discontinued', 'unknown'].includes(status)) {
      updateData.status = status;
    }
    if (kind !== undefined) {
      (updateData as any).kind = kind;
    }
    if (tags !== undefined) {
      (updateData as any).tags = Array.isArray(tags) ? tags : null;
    }
    if (isImportValue !== undefined) {
      updateData.isImport = isImportValue;
    }

    const scope = await getRequestScope(req as any);
    const skuId = parseInt(id);
    const updatedSkus = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      let fallbackName = typeof name === 'string' && name.trim().length > 0 ? name : undefined;

      if ((slug !== undefined || fallbackName === undefined) && (slug !== undefined || name !== undefined)) {
        const existing = await scopedDb
          .select({ id: skus.id, name: skus.name })
          .from(skus)
          .where(eq(skus.id, skuId))
          .limit(1);

        if (existing.length === 0) {
          return [];
        }

        if (!fallbackName) {
          fallbackName = existing[0].name;
        }
      }

      if (name !== undefined) {
        updateData.name = name;
      }

      if (slug !== undefined || name !== undefined) {
        if (!fallbackName) {
          throw new SlugValidationError('Name is required to generate slug');
        }
        const slugSource = slug !== undefined ? slug : name;
        updateData.slug = await generateUniqueSlug(
          scopedDb,
          slugSource,
          fallbackName,
          scope.customerId,
          skuId
        );
      }

      return scopedDb
        .update(skus)
        .set(updateData)
        .where(eq(skus.id, skuId))
        .returning();
    });

    if (updatedSkus.length === 0) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    const updated = updatedSkus[0];
    eventBus.broadcast({
      event: 'data_change:skus',
      data: { type: 'update', resource: 'skus', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    res.json({ data: updated });

  } catch (error) {
    if (error instanceof SlugValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('SKU PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/skus/:id
 * Delete SKU (requires auth)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedSkus = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb, client) => {
      // Note: sku_components has CASCADE DELETE in schema, so they'll be auto-deleted
      
      // Guard 1: block if SKU is used as a component in other kits
      try {
        const usedRows = skuComponents
          ? await scopedDb.select({ id: (skuComponents as any).id }).from(skuComponents).where(eq((skuComponents as any).componentSkuId, parseInt(id))).limit(1)
          : (await client.query('SELECT id FROM sku_components WHERE component_sku_id = $1 LIMIT 1', [parseInt(id)])).rows;
        if (usedRows && usedRows.length > 0) {
          throw Object.assign(new Error('Cannot delete SKU used in other kits'), { status: 400, code: 'USED_IN_KITS' });
        }
      } catch (e) {
        if ((e as any)?.code === 'USED_IN_KITS') throw e;
      }

      // Guard 2: block if SKU has inventory items
      try {
        const invRows = await client.query('SELECT id FROM inventory_items WHERE sku_id = $1 LIMIT 1', [parseInt(id)]);
        if (invRows?.rows?.length > 0) {
          throw Object.assign(new Error('Cannot delete SKU with inventory items'), { status: 400, code: 'HAS_INVENTORY' });
        }
      } catch (e) {
        if ((e as any)?.code === 'HAS_INVENTORY') throw e;
      }

      // Proceed with delete (cascade will handle sku_components cleanup)
      return scopedDb
        .delete(skus)
        .where(eq(skus.id, parseInt(id)))
        .returning();
    });

    if (deletedSkus.length === 0) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    const deleted = deletedSkus[0];
    eventBus.broadcast({
      event: 'data_change:skus',
      data: { type: 'delete', resource: 'skus', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });
    res.json({ message: 'SKU deleted successfully' });

  } catch (error: any) {
    console.error('SKU DELETE error:', error);
    if (error?.code === 'USED_IN_KITS' || error?.code === 'HAS_INVENTORY') {
      return res.status(error.status || 400).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/skus/:id/composite
 * Update SKU and replace its components in a single transaction
 * Body: { sku?: { name?, productId?, ... }, components?: [{ componentSkuId, quantity, isRequired?, sortOrder?, costAllocation? }] }
 */
router.put('/:id/composite', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { sku: skuInput = {}, components: componentsRaw, bomItems } = req.body || {};
    const components = componentsRaw ?? bomItems ?? [];

    const scope = await getRequestScope(req as any);
    const skuId = parseInt(id);
    const updated = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb, client) => {
      // Update SKU if fields provided
      if (skuInput && Object.keys(skuInput).length > 0) {
        const updateData: any = { updatedAt: new Date() };
        const isImportValue = parseOptionalBoolean(skuInput?.isImport ?? skuInput?.is_import, 'isImport');
        let fallbackName = typeof skuInput.name === 'string' && skuInput.name.trim().length > 0 ? skuInput.name : undefined;

        if ((skuInput.slug !== undefined || fallbackName === undefined) && (skuInput.slug !== undefined || skuInput.name !== undefined)) {
          const existing = await scopedDb
            .select({ id: skus.id, name: skus.name })
            .from(skus)
            .where(eq(skus.id, skuId))
            .limit(1);

          if (existing.length === 0) {
            return undefined;
          }

          if (!fallbackName) {
            fallbackName = existing[0].name;
          }
        }

        if (skuInput.name !== undefined) {
          updateData.name = skuInput.name;
        }

        if (skuInput.slug !== undefined || skuInput.name !== undefined) {
          if (!fallbackName) {
            throw new SlugValidationError('Name is required to generate slug');
          }
          const slugSource = skuInput.slug !== undefined ? skuInput.slug : skuInput.name;
          updateData.slug = await generateUniqueSlug(
            scopedDb,
            slugSource,
            fallbackName,
            scope.customerId,
            skuId
          );
        }
        if (skuInput.productId !== undefined) {
          updateData.productId = skuInput.productId ? parseInt(skuInput.productId) : null;
        }
        if (skuInput.vendorId !== undefined) {
          updateData.vendorId = skuInput.vendorId ? parseInt(skuInput.vendorId) : null;
        }
        if (skuInput.brandId !== undefined) {
          updateData.brandId = skuInput.brandId ? parseInt(skuInput.brandId) : null;
        }
        if (skuInput.vendorSku !== undefined) {
          updateData.vendorSku = skuInput.vendorSku;
        }
        if (skuInput.purchaseUrl !== undefined) {
          updateData.purchaseUrl = skuInput.purchaseUrl;
        }
        if (skuInput.price !== undefined) {
          updateData.price = skuInput.price;
        }
        if (skuInput.isPurchasable !== undefined) {
          updateData.isPurchasable = skuInput.isPurchasable;
        }
        if (skuInput.currency !== undefined) {
          updateData.currency = skuInput.currency;
        }
        if (skuInput.lifespanYears !== undefined) {
          updateData.lifespanYears = skuInput.lifespanYears ? parseInt(skuInput.lifespanYears) : null;
        }
        if (skuInput.notes !== undefined) {
          updateData.notes = skuInput.notes;
        }
        if (skuInput.status !== undefined) {
          updateData.status = skuInput.status;
        }
        if (skuInput.kind !== undefined) {
          (updateData as any).kind = skuInput.kind;
        }
        if (skuInput.tags !== undefined) {
          (updateData as any).tags = Array.isArray(skuInput.tags) ? skuInput.tags : null;
        }
        if (isImportValue !== undefined) {
          updateData.isImport = isImportValue;
        }

        await scopedDb.update(skus).set(updateData).where(eq(skus.id, skuId)).returning();
      }

      // Replace components: delete existing and insert new
      if (skuComponents) {
        // delete existing
        await scopedDb.delete(skuComponents).where(eq((skuComponents as any).parentSkuId, skuId));
        if (Array.isArray(components) && components.length > 0) {
          const rows = components.map((c: any, idx: number) => ({
            parentSkuId: skuId,
            componentSkuId: parseInt(c.componentSkuId),
            quantity: Number(c.quantity) || 1,
            isRequired: c.isRequired !== undefined ? !!c.isRequired : true,
            sortOrder: c.sortOrder !== undefined ? Number(c.sortOrder) : idx,
            costAllocation: c.costAllocation !== undefined ? Number(c.costAllocation) : null,
            notes: c.notes ?? null,
          }));
          await scopedDb.insert(skuComponents).values(rows);
        }
      } else {
        // Raw SQL fallback
        await client.query('DELETE FROM sku_components WHERE parent_sku_id = $1', [skuId]);
        for (let i = 0; i < components.length; i++) {
          const c = components[i];
          await client.query(
            'INSERT INTO sku_components (parent_sku_id, component_sku_id, quantity, is_required, sort_order, cost_allocation) VALUES ($1, $2, $3, $4, $5, $6)',
            [skuId, parseInt(c.componentSkuId), Number(c.quantity) || 1, c.isRequired !== undefined ? !!c.isRequired : true, c.sortOrder !== undefined ? Number(c.sortOrder) : i, c.costAllocation !== undefined ? Number(c.costAllocation) : null]
          );
        }
      }

      // Return the updated SKU
      const rows = await scopedDb.select().from(skus).where(eq(skus.id, skuId)).limit(1);
      return rows[0];
    });

    if (!updated) return res.status(404).json({ error: 'SKU not found' });

    eventBus.broadcast({
      event: 'data_change:skus',
      data: { type: 'update', resource: 'skus', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } }
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof SlugValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('SKU composite PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

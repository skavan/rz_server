/**
 * Inventory Items API - Clean Drizzle Implementation
 */
import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { inventoryItems, eq, ilike, or, asc, desc, and, ne, sql, gte, lte, lt } from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';

const router = Router();

/**
 * GET /api/inventory-items
 * Get all inventory items with optional filtering
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      product_id,
      location_id,
      home_id,
      search,
      status,
      low_stock,
      expiring_soon,
      limit = '50',
      offset = '0',
      sort = 'updatedAt',
      order = 'desc'
    } = req.query;

    // Build WHERE conditions
    const whereConditions = [];
    
    if (product_id) {
      whereConditions.push(eq(inventoryItems.productId, parseInt(product_id as string)));
    }
    if (location_id) {
      whereConditions.push(eq(inventoryItems.locationId, parseInt(location_id as string)));
    }
    if (home_id) {
      whereConditions.push(eq(inventoryItems.homeId, parseInt(home_id as string)));
    }
    if (status) {
      whereConditions.push(eq(inventoryItems.status, status as any));
    }
    if (search) {
      whereConditions.push(
        or(
          ilike(inventoryItems.notes, `%${search}%`),
          ilike(inventoryItems.serialNumber, `%${search}%`),
          ilike(inventoryItems.assetTag, `%${search}%`)
        )
      );
    }
    
    // Low stock filter: quantity <= 5 (configurable threshold)
    if (low_stock === 'true') {
      const threshold = parseInt(req.query.low_stock_threshold as string) || 5;
      whereConditions.push(
        lte(inventoryItems.quantity, threshold)
      );
    }
    
    // Warranty expiring soon filter (next 30 days)
    if (expiring_soon === 'true') {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      whereConditions.push(
        sql`${inventoryItems.warrantyExpires} IS NOT NULL AND ${inventoryItems.warrantyExpires} <= ${thirtyDaysFromNow.toISOString().split('T')[0]}`
      );
    }

    // Build WHERE clause
    const whereClause = whereConditions.length === 0 ? undefined : 
                       whereConditions.length === 1 ? whereConditions[0] : 
                       and(...whereConditions);

    // Build ORDER BY
    const sortColumn = sort === 'quantity' ? inventoryItems.quantity :
                      sort === 'purchaseDate' ? inventoryItems.purchaseDate :
                      sort === 'createdAt' ? inventoryItems.createdAt :
                      sort === 'purchasePrice' ? inventoryItems.purchasePrice :
                      inventoryItems.updatedAt;
    const orderBy = order === 'desc' ? desc(sortColumn) : asc(sortColumn);

    // Execute within tenant scope
    const scope = await getRequestScope(req as any);
    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(inventoryItems)
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
    console.error('Inventory items GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/inventory-items/:id
 * Get single inventory item by ID
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, parseInt(id)))
        .limit(1);
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ data: results[0] });

  } catch (error) {
    console.error('Inventory item GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-items
 * Create new inventory item (requires auth)
 */
router.post('/', authenticateToken, autoInjectMiddleware('inventoryItems'), async (req, res) => {
  try {
    const {
      skuId,
      productId,
      locationId,
      homeId,
      customerId,
      quantity,
      serialNumber,
      assetTag,
      status,
      condition,
      purchaseDate,
      purchasePrice,
      currency,
      warrantyExpires,
      expectedReplacement,
      parentItemId,
      isKitComponent,
      tags,
      notes
    } = req.body || {};

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    if (!skuId) {
      return res.status(400).json({ error: 'SKU ID is required' });
    }

    // homeId and customerId are now guaranteed by middleware
    const scope = getScopeFromRequest(req as any);
    const newItems = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(inventoryItems)
        .values({
          customerId,
          homeId: parseInt(homeId),
          skuId: parseInt(skuId),
          productId: parseInt(productId),
          locationId: locationId ? parseInt(locationId) : null,
          quantity: quantity !== undefined ? Number(quantity) : 1,
          serialNumber: serialNumber || null,
          assetTag: assetTag || null,
          status: status as any || 'unassigned',
          condition: condition as any || 'good',
          purchaseDate: purchaseDate || null,
          purchasePrice: purchasePrice !== undefined ? String(purchasePrice) : null,
          currency: currency || 'USD',
          warrantyExpires: warrantyExpires || null,
          expectedReplacement: expectedReplacement || null,
          parentItemId: parentItemId ? parseInt(parentItemId) : null,
          isKitComponent: isKitComponent !== undefined ? !!isKitComponent : false,
          tags: Array.isArray(tags) ? tags : null,
          notes: notes || null,
        })
        .returning();
    });

    const created = newItems[0];
    // Broadcast realtime event
    eventBus.broadcast({
      event: 'data_change:inventory_items',
      data: { type: 'create', resource: 'inventory_items', resourceId: created.id, data: created },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: created.homeId ? [created.homeId] : [] } }
    });
    res.status(201).json({ data: created });

  } catch (error) {
    console.error('Inventory item POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/inventory-items/:id
 * Update inventory item (requires auth)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      skuId,
      productId,
      locationId,
      quantity,
      serialNumber,
      assetTag,
      status,
      condition,
      lastChecked,
      lastMaintained,
      purchaseDate,
      purchasePrice,
      currency,
      warrantyExpires,
      expectedReplacement,
      parentItemId,
      isKitComponent,
      hasMediaAssets,
      tags,
      notes,
      isActive
    } = req.body || {};

    const updateData: any = {
      updatedAt: new Date()
    };

    if (skuId !== undefined) {
      updateData.skuId = parseInt(skuId);
    }
    if (productId !== undefined) {
      updateData.productId = parseInt(productId);
    }
    if (locationId !== undefined) {
      updateData.locationId = locationId ? parseInt(locationId) : null;
    }
    if (quantity !== undefined) {
      updateData.quantity = Number(quantity);
    }
    if (serialNumber !== undefined) {
      updateData.serialNumber = serialNumber;
    }
    if (assetTag !== undefined) {
      updateData.assetTag = assetTag;
    }
    if (status !== undefined) {
      updateData.status = status as any;
    }
    if (condition !== undefined) {
      updateData.condition = condition as any;
    }
    if (lastChecked !== undefined) {
      updateData.lastChecked = lastChecked ? new Date(lastChecked) : null;
    }
    if (lastMaintained !== undefined) {
      updateData.lastMaintained = lastMaintained ? new Date(lastMaintained) : null;
    }
    if (purchaseDate !== undefined) {
      updateData.purchaseDate = purchaseDate;
    }
    if (purchasePrice !== undefined) {
      updateData.purchasePrice = purchasePrice !== null ? String(purchasePrice) : null;
    }
    if (currency !== undefined) {
      updateData.currency = currency;
    }
    if (warrantyExpires !== undefined) {
      updateData.warrantyExpires = warrantyExpires;
    }
    if (expectedReplacement !== undefined) {
      updateData.expectedReplacement = expectedReplacement;
    }
    if (parentItemId !== undefined) {
      updateData.parentItemId = parentItemId ? parseInt(parentItemId) : null;
    }
    if (isKitComponent !== undefined) {
      updateData.isKitComponent = !!isKitComponent;
    }
    if (hasMediaAssets !== undefined) {
      updateData.hasMediaAssets = !!hasMediaAssets;
    }
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags : null;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (isActive !== undefined) {
      updateData.isActive = !!isActive;
    }

    const scope = await getRequestScope(req as any);
    const updatedItems = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .update(inventoryItems)
        .set(updateData)
        .where(eq(inventoryItems.id, parseInt(id)))
        .returning();
    });

    if (updatedItems.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const updated = updatedItems[0];
    eventBus.broadcast({
      event: 'data_change:inventory_items',
      data: { type: 'update', resource: 'inventory_items', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: updated.homeId ? [updated.homeId] : [] } }
    });
    res.json({ data: updated });

  } catch (error) {
    console.error('Inventory item PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/inventory-items/:id
 * Delete inventory item (requires auth)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const scope = await getRequestScope(req as any);
    const deletedItems = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(inventoryItems)
        .where(eq(inventoryItems.id, parseInt(id)))
        .returning();
    });

    if (deletedItems.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const deleted = deletedItems[0];
    eventBus.broadcast({
      event: 'data_change:inventory_items',
      data: { type: 'delete', resource: 'inventory_items', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: deleted.homeId ? [deleted.homeId] : [] } }
    });
    res.json({ message: 'Inventory item deleted successfully' });

  } catch (error: any) {
    console.error('Inventory item DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/inventory-items/:id/adjust-quantity
 * Adjust inventory quantity (add or subtract)
 * Body: { adjustment: number, reason?: string }
 */
router.patch('/:id/adjust-quantity', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment, reason } = req.body || {};

    if (adjustment === undefined || adjustment === null || typeof adjustment !== 'number') {
      return res.status(400).json({ error: 'Adjustment value is required and must be a number' });
    }

    const scope = await getRequestScope(req as any);
    const updatedItems = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      // First get current item to calculate new quantity
      const current = await scopedDb
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, parseInt(id)))
        .limit(1);

      if (current.length === 0) {
        throw new Error('Inventory item not found');
      }

      const newQuantity = (current[0].quantity || 0) + adjustment;
      
      if (newQuantity < 0) {
        throw Object.assign(new Error('Adjustment would result in negative quantity'), { status: 400 });
      }

      return scopedDb
        .update(inventoryItems)
        .set({
          quantity: newQuantity,
          notes: reason ? `${current[0].notes || ''}\n[${new Date().toISOString()}] Adjusted by ${adjustment}: ${reason}`.trim() : current[0].notes,
          updatedAt: new Date()
        })
        .where(eq(inventoryItems.id, parseInt(id)))
        .returning();
    });

    if (updatedItems.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const updated = updatedItems[0];
    eventBus.broadcast({
      event: 'data_change:inventory_items',
      data: { type: 'update', resource: 'inventory_items', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: updated.homeId ? [updated.homeId] : [] } }
    });
    res.json({ data: updated });

  } catch (error: any) {
    console.error('Inventory item quantity adjustment error:', error);
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

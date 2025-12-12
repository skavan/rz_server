/**
 * Inventory Items API - Clean Drizzle Implementation
 */
import { Router, type Request, type Response } from 'express';
import { withTenantScope } from '../db/index.js';
import {
  inventoryItems,
  mediaAssets,
  locations,
  issues,
  eq,
  ilike,
  or,
  asc,
  desc,
  and,
  sql,
  lte,
  inArray,
  isNull,
} from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import type { RequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { parsePagination } from './shared/validation.js';

const router = Router();

// TODO(shared-schema-sync): This route manually mirrors every inventory_items field. Refactor to use
// shared schema parsing (e.g., inventoryItemsValidationSchema) so newly added columns are handled
// automatically rather than patched in one-by-one.
const normalizeDecimalInput = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric.toString();
    return trimmed; // allow caller to handle non-numeric validation downstream
  }
  return null;
};

type InventoryItemRow = typeof inventoryItems.$inferSelect;
type MediaAssetRow = typeof mediaAssets.$inferSelect;
type MediaSourceType = Extract<
  MediaAssetRow['entityType'],
  'inventory_item' | 'product' | 'sku' | 'location' | 'location_type' | 'home'
>;

type InventoryMediaEntry = MediaAssetRow & {
  sourceEntityType: MediaSourceType;
  sourceEntityId: number;
  priority: number;
};

const includeTokenSet = new Set(['media', 'inventory_media', 'inventory_items_media']);
const truthyStringSet = new Set(['true', '1', 'yes', 'on']);

const shouldIncludeMedia = (query: Record<string, any>): boolean => {
  const includeMediaFlag = query.include_media ?? query.includeMedia;
  if (Array.isArray(includeMediaFlag)) {
    if (includeMediaFlag.some((value) => truthyStringSet.has(String(value).toLowerCase()))) {
      return true;
    }
  } else if (typeof includeMediaFlag === 'string') {
    if (truthyStringSet.has(includeMediaFlag.toLowerCase())) {
      return true;
    }
  } else if (typeof includeMediaFlag === 'boolean' && includeMediaFlag) {
    return true;
  }

  const includeParam = query.include;
  if (typeof includeParam === 'string') {
    return includeParam
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .some((token) => includeTokenSet.has(token));
  }
  if (Array.isArray(includeParam)) {
    return includeParam
      .flatMap((item) => String(item).split(','))
      .map((token) => token.trim().toLowerCase())
      .some((token) => includeTokenSet.has(token));
  }

  return false;
};

const groupMediaByEntity = (rows: MediaAssetRow[]): Map<number, MediaAssetRow[]> => {
  const map = new Map<number, MediaAssetRow[]>();
  for (const asset of rows) {
    const existing = map.get(asset.entityId) ?? [];
    existing.push(asset);
    map.set(asset.entityId, existing);
  }
  return map;
};

const buildInventoryMediaMap = async (
  scope: RequestScope,
  items: InventoryItemRow[]
): Promise<Record<number, InventoryMediaEntry[]>> => {
  if (items.length === 0) {
    return {};
  }

  return withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
    const locationIds = Array.from(
      new Set(items.map((item) => item.locationId).filter((id): id is number => id != null))
    );

    const locationTypeByLocationId = new Map<number, number | null>();
    if (locationIds.length > 0) {
      const locationRows = await scopedDb
        .select({ id: locations.id, locationTypeId: locations.locationTypeId })
        .from(locations)
        .where(inArray(locations.id, locationIds));

      for (const row of locationRows) {
        locationTypeByLocationId.set(row.id, row.locationTypeId ?? null);
      }
    }

    const locationTypeByInventoryId = new Map<number, number | null>();
    for (const item of items) {
      const locationId = item.locationId ?? null;
      const locationTypeId = locationId ? locationTypeByLocationId.get(locationId) ?? null : null;
      locationTypeByInventoryId.set(item.id, locationTypeId);
    }

    const entityBuckets: Record<MediaSourceType, Set<number>> = {
      inventory_item: new Set<number>(),
      product: new Set<number>(),
      sku: new Set<number>(),
      location: new Set<number>(),
      location_type: new Set<number>(),
      home: new Set<number>(),
    };

    for (const item of items) {
      entityBuckets.inventory_item.add(item.id);
      if (item.productId) entityBuckets.product.add(item.productId);
      if (item.skuId) entityBuckets.sku.add(item.skuId);
      if (item.locationId) entityBuckets.location.add(item.locationId);
      const locationTypeId = locationTypeByInventoryId.get(item.id);
      if (locationTypeId) entityBuckets.location_type.add(locationTypeId);
      if (item.homeId) entityBuckets.home.add(item.homeId);
    }

    const assetsByType = new Map<MediaSourceType, Map<number, MediaAssetRow[]>>();

    for (const [entityType, idSet] of Object.entries(entityBuckets) as [MediaSourceType, Set<number>][]) {
      if (idSet.size === 0) continue;
      const ids = Array.from(idSet);
      const rows = await scopedDb
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.entityType, entityType as any),
            inArray(mediaAssets.entityId, ids),
            eq(mediaAssets.isActive, true)
          )
        )
        .orderBy(desc(mediaAssets.isPrimary), mediaAssets.sortOrder);

      assetsByType.set(entityType, groupMediaByEntity(rows));
    }

    const mediaByInventoryId: Record<number, InventoryMediaEntry[]> = {};

    for (const item of items) {
      const fallbackChain: Array<{ entityType: MediaSourceType; entityId: number | null }> = [
        { entityType: 'inventory_item', entityId: item.id },
        { entityType: 'product', entityId: item.productId ?? null },
        { entityType: 'sku', entityId: item.skuId ?? null },
        { entityType: 'location', entityId: item.locationId ?? null },
        { entityType: 'location_type', entityId: locationTypeByInventoryId.get(item.id) ?? null },
        { entityType: 'home', entityId: item.homeId ?? null },
      ];

      let selected: InventoryMediaEntry[] = [];
      for (let priority = 0; priority < fallbackChain.length; priority++) {
        const step = fallbackChain[priority];
        if (!step.entityId) continue;
        const assets = assetsByType.get(step.entityType)?.get(step.entityId) ?? [];
        if (assets.length > 0) {
          selected = assets.map((asset) => ({
            ...asset,
            sourceEntityType: step.entityType,
            sourceEntityId: step.entityId!,
            priority,
          }));
          break;
        }
      }

      mediaByInventoryId[item.id] = selected;
    }

    return mediaByInventoryId;
  });
};

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
      sort = 'updatedAt',
      order = 'desc'
    } = req.query;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset);

    const includeMedia = shouldIncludeMedia(req.query as Record<string, any>);

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
        .limit(limit)
        .offset(offset);
    });

    let inventoryMedia: Record<number, InventoryMediaEntry[]> | undefined;
    if (includeMedia) {
      inventoryMedia = await buildInventoryMediaMap(scope, results);
    }

    const response: Record<string, any> = {
      data: results,
      meta: {
        count: results.length,
        limit,
        offset
      }
    };

    if (inventoryMedia) {
      response.included = { inventory_items_media: inventoryMedia };
    }

    res.json(response);

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
    const includeMedia = shouldIncludeMedia(req.query as Record<string, any>);

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

    let included: Record<string, any> | undefined;
    if (includeMedia) {
      const media = await buildInventoryMediaMap(scope, results);
      included = { inventory_items_media: media };
    }

    const response: Record<string, any> = { data: results[0] };
    if (included) {
      response.included = included;
    }

    res.json(response);

  } catch (error) {
    console.error('Inventory item GET by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-items
 * Create new inventory item (requires auth)
 */
router.post('/', authenticateToken, autoInjectMiddleware('inventoryItems', { requireWrite: true }), async (req, res) => {
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
      sublocation,
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
      tags,
      notes,
      markedGoodDate,
    } = req.body || {};

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    if (!skuId) {
      return res.status(400).json({ error: 'SKU ID is required' });
    }

    const normalizedMarkedGoodDate = markedGoodDate ? new Date(markedGoodDate) : null;
    const normalizedLastChecked =
      lastChecked !== undefined ? (lastChecked ? new Date(lastChecked) : null) : normalizedMarkedGoodDate;
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
          sublocation: sublocation || null,
          status: status as any || 'unassigned',
          condition: condition as any || 'good',
          lastChecked: normalizedLastChecked ?? null,
          lastMaintained: lastMaintained ? new Date(lastMaintained) : null,
          purchaseDate: purchaseDate || null,
          purchasePrice: normalizeDecimalInput(purchasePrice),
          currency: currency || 'USD',
          warrantyExpires: warrantyExpires || null,
          expectedReplacement: expectedReplacement || null,
          parentItemId: parentItemId ? parseInt(parentItemId) : null,
          isKitComponent: isKitComponent !== undefined ? !!isKitComponent : false,
          tags: Array.isArray(tags) ? tags : null,
          notes: notes || null,
          markedGoodDate: normalizedMarkedGoodDate,
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
router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      skuId,
      productId,
      locationId,
      quantity,
      serialNumber,
      assetTag,
      sublocation,
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
      isActive,
      markedGoodDate,
    } = req.body || {};

    const updateData: any = {
      updatedAt: new Date()
    };

    // TODO: This entire update block should be driven by shared schema parsing rather than manual field lists.

    if (skuId !== undefined) {
      updateData.skuId = parseInt(skuId);
    }
    if (sublocation !== undefined) {
      updateData.sublocation = sublocation;
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
      updateData.purchasePrice = normalizeDecimalInput(purchasePrice);
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
    if (markedGoodDate !== undefined) {
      const normalizedMarkedGoodDate = markedGoodDate ? new Date(markedGoodDate) : null;
      updateData.markedGoodDate = normalizedMarkedGoodDate;
      if (lastChecked === undefined) {
        updateData.lastChecked = normalizedMarkedGoodDate;
      }
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
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const itemId = parseInt(id, 10);
    if (Number.isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid inventory item id' });
    }

    const scope = await getRequestScope(req as any);

    const hasBlockingIssues = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const rows = await scopedDb
        .select({ id: issues.id })
        .from(issues)
        .where(
          and(
            eq(issues.entityType, 'inventory_item'),
            eq(issues.entityId, itemId),
            inArray(issues.status, ['open', 'in_progress']),
            isNull(issues.deletedAt)
          )
        )
        .limit(1);
      return rows.length > 0;
    });

    if (hasBlockingIssues) {
      return res.status(409).json({
        error: 'Cannot delete inventory item while open or in-progress issues exist. Resolve or delete those issues first.',
      });
    }

    const deletedItems = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .delete(inventoryItems)
        .where(eq(inventoryItems.id, itemId))
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
 * PATCH/PUT /api/inventory-items/:id/adjust-quantity
 * Adjust inventory quantity (add or subtract)
 * Body: { adjustment: number, reason?: string }
 */
async function handleInventoryQuantityAdjustment(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { adjustment, reason } = req.body || {};

    if (adjustment === undefined || adjustment === null || typeof adjustment !== 'number') {
      return res.status(400).json({ error: 'Adjustment value is required and must be a number' });
    }

    const itemId = Number.parseInt(id, 10);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ error: 'Invalid inventory item id' });
    }

    const scope = await getRequestScope(req as any);
    const updatedItems = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const current = await scopedDb
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, itemId))
          .limit(1);

        if (current.length === 0) {
          return [];
        }

        const newQuantity = (current[0].quantity || 0) + adjustment;
        if (newQuantity < 0) {
          throw Object.assign(new Error('Adjustment would result in negative quantity'), { status: 400 });
        }

        const now = new Date();
        const reasonText = typeof reason === 'string' ? reason.trim() : '';
        const notesValue =
          reasonText.length > 0
            ? `${current[0].notes || ''}\n[${now.toISOString()}] Adjusted by ${adjustment}: ${reasonText}`.trim() || null
            : current[0].notes ?? null;

        return scopedDb
          .update(inventoryItems)
          .set({
            quantity: newQuantity,
            notes: notesValue,
            updatedAt: now,
          })
          .where(eq(inventoryItems.id, itemId))
          .returning();
      }
    );

    if (updatedItems.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const updated = updatedItems[0];
    eventBus.broadcast({
      event: 'data_change:inventory_items',
      data: { type: 'update', resource: 'inventory_items', resourceId: updated.id, data: updated },
      meta: { timestamp: Date.now(), source: 'api', audience: { homeIds: updated.homeId ? [updated.homeId] : [] } },
    });
    res.json({ data: updated });
  } catch (error: any) {
    console.error('Inventory item quantity adjustment error:', error);
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.patch('/:id/adjust-quantity', authenticateToken, async (req, res) => {
  await handleInventoryQuantityAdjustment(req, res);
});

router.put('/:id/adjust-quantity', authenticateToken, requireWriteMiddleware, async (req, res) => {
  await handleInventoryQuantityAdjustment(req, res);
});

export default router;

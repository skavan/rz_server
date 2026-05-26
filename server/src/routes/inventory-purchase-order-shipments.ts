/**
 * Inventory Purchase Order Shipments API
 * Tracks tracking numbers and line-item allocations per purchase order.
 */
import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import {
  inventoryPurchaseOrderShipments,
  inventoryPurchaseOrderShipmentItems,
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  eq,
  and,
  inArray,
  desc,
  asc,
  ilike,
} from '@skavan/rentalzen-drizzle';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';
import { normalizeDateOnlyFields, normalizeDateOnlyFieldsArray } from '../utils/field-transformer.js';
import {
  ValidationError,
  parseOptionalInteger,
  parseOptionalString,
  parseOptionalDate,
  parseOptionalDateOnly,
  parseOptionalJson,
  parsePagination,
  requireString,
} from './shared/validation.js';

const router = Router();

const SHIPMENT_STATUS_VALUES = ['label_created', 'in_transit', 'delivered', 'exception', 'canceled'] as const;
type ShipmentStatus = (typeof SHIPMENT_STATUS_VALUES)[number];
const SHIPMENT_STATUS_SET = new Set<ShipmentStatus>(SHIPMENT_STATUS_VALUES);

const coerceStatus = (value: unknown): ShipmentStatus => {
  if (value === undefined || value === null || value === '') return 'label_created';
  const status = String(value) as ShipmentStatus;
  if (!SHIPMENT_STATUS_SET.has(status)) {
    throw new ValidationError(`status must be one of ${SHIPMENT_STATUS_VALUES.join(', ')}`);
  }
  return status;
};

const parseRequiredPositiveInt = (value: unknown, field: string): number => {
  const parsed = parseOptionalInteger(value, field);
  if (parsed == null) {
    throw new ValidationError(`${field} is required`);
  }
  if (parsed <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return parsed;
};

const parseQuantity = (value: unknown, field: string, fallback: number): number => {
  const parsed = parseOptionalInteger(value, field);
  if (parsed == null) return fallback;
  if (parsed <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return parsed;
};

const parseNonNegativeQuantity = (value: unknown, field: string, fallback: number): number => {
  const parsed = parseOptionalInteger(value, field);
  if (parsed == null) return fallback;
  if (parsed < 0) {
    throw new ValidationError(`${field} must be zero or greater`);
  }
  return parsed;
};

/**
 * GET /api/inventory-purchase-order-shipments
 * List shipments (optionally filter by purchase_order_id)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { purchase_order_id, status, tracking_number, sort = 'createdAt', order = 'desc' } = req.query as Record<string, string | undefined>;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset);

    const filters: any[] = [eq(inventoryPurchaseOrderShipments.customerId, scope.customerId)];

    if (purchase_order_id !== undefined) {
      const poId = parseOptionalInteger(purchase_order_id, 'purchase_order_id');
      if (poId == null) {
        throw new ValidationError('purchase_order_id must be numeric');
      }
      filters.push(eq(inventoryPurchaseOrderShipments.purchaseOrderId, poId));
    }

    if (status !== undefined) {
      const parsedStatus = coerceStatus(status);
      filters.push(eq(inventoryPurchaseOrderShipments.status, parsedStatus));
    }

    if (tracking_number) {
      filters.push(ilike(inventoryPurchaseOrderShipments.trackingNumber, `%${tracking_number}%`));
    }

    const whereClause = filters.length === 1 ? filters[0] : and(...filters);
    const sortColumn =
      sort === 'trackingNumber'
        ? inventoryPurchaseOrderShipments.trackingNumber
        : sort === 'status'
          ? inventoryPurchaseOrderShipments.status
          : inventoryPurchaseOrderShipments.createdAt;
    const orderBy = order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(inventoryPurchaseOrderShipments)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset);
      }
    );

    res.json({ data: normalizeDateOnlyFieldsArray(rows), meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order shipments list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/inventory-purchase-order-shipments/:id
 * Get a shipment with its allocated items
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = parseRequiredPositiveInt(req.params.id, 'id');

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const [shipment] = await scopedDb
          .select()
          .from(inventoryPurchaseOrderShipments)
          .where(and(
            eq(inventoryPurchaseOrderShipments.customerId, scope.customerId),
            eq(inventoryPurchaseOrderShipments.id, id)
          ))
          .limit(1);

        if (!shipment) return null;

        const items = await scopedDb
          .select()
          .from(inventoryPurchaseOrderShipmentItems)
          .where(eq(inventoryPurchaseOrderShipmentItems.shipmentId, id))
          .orderBy(asc(inventoryPurchaseOrderShipmentItems.id));

        return { ...shipment, items };
      }
    );

    if (!result) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    res.json({ data: normalizeDateOnlyFields(result) });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order shipment get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-purchase-order-shipments/composite
 * Create shipment and its item allocations
 * Body: { shipment: {...}, items?: [{ purchaseOrderItemId, quantity?, receivedQuantity?, metadata? }] }
 */
router.post('/composite', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { shipment, inventory_purchase_order_shipment: shipmentAlias, items = [] } = req.body || {};
    const shipmentInput = shipment ?? shipmentAlias;

    if (!shipmentInput) {
      return res.status(400).json({ error: 'shipment is required' });
    }

    const purchaseOrderId = parseRequiredPositiveInt(
      shipmentInput.purchaseOrderId ?? shipmentInput.purchase_order_id,
      'purchaseOrderId'
    );
    const trackingNumber = requireString(
      shipmentInput.trackingNumber ?? shipmentInput.tracking_number,
      'trackingNumber'
    );
    const status = coerceStatus(shipmentInput.status);

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const poRows = await scopedDb
          .select({ id: inventoryPurchaseOrders.id })
          .from(inventoryPurchaseOrders)
          .where(and(
            eq(inventoryPurchaseOrders.customerId, scope.customerId),
            eq(inventoryPurchaseOrders.id, purchaseOrderId)
          ))
          .limit(1);

        if (poRows.length === 0) {
          throw new ValidationError('Purchase order not found', 404);
        }

        const [createdShipment] = await scopedDb
          .insert(inventoryPurchaseOrderShipments)
          .values({
            customerId: scope.customerId,
            purchaseOrderId,
            carrier: parseOptionalString(shipmentInput.carrier) ?? null,
            trackingNumber,
            status,
            shippedAt: parseOptionalDate(shipmentInput.shippedAt ?? shipmentInput.shipped_at, 'shippedAt'),
            deliveredAt: parseOptionalDate(shipmentInput.deliveredAt ?? shipmentInput.delivered_at, 'deliveredAt'),
            etaDate: parseOptionalDateOnly(shipmentInput.etaDate ?? shipmentInput.eta_date, 'etaDate'),
            metadata: parseOptionalJson(shipmentInput.metadata, 'metadata') ?? null,
          })
          .returning();

        let createdItems: any[] = [];
        if (Array.isArray(items) && items.length > 0) {
          const itemIds = Array.from(new Set(items.map((item: any) =>
            parseRequiredPositiveInt(item.purchaseOrderItemId ?? item.purchase_order_item_id, 'purchaseOrderItemId')
          )));

          const poItemRows = await scopedDb
            .select({ id: inventoryPurchaseOrderItems.id })
            .from(inventoryPurchaseOrderItems)
            .where(and(
              eq(inventoryPurchaseOrderItems.purchaseOrderId, purchaseOrderId),
              eq(inventoryPurchaseOrderItems.customerId, scope.customerId),
              inArray(inventoryPurchaseOrderItems.id, itemIds)
            ));

          if (poItemRows.length !== itemIds.length) {
            throw new ValidationError('One or more purchase order items are invalid for this purchase order');
          }

          const itemRows = items.map((item: any) => ({
            customerId: scope.customerId,
            shipmentId: createdShipment.id,
            purchaseOrderItemId: parseRequiredPositiveInt(
              item.purchaseOrderItemId ?? item.purchase_order_item_id,
              'purchaseOrderItemId'
            ),
            quantity: parseQuantity(item.quantity, 'quantity', 1),
            receivedQuantity: parseNonNegativeQuantity(item.receivedQuantity, 'receivedQuantity', 0),
            metadata: parseOptionalJson(item.metadata, 'metadata') ?? null,
          }));

          createdItems = await scopedDb
            .insert(inventoryPurchaseOrderShipmentItems)
            .values(itemRows)
            .returning();
        }

        return { ...createdShipment, items: createdItems };
      }
    );

    eventBus.broadcast({
      event: 'data_change:inventory_purchase_order_shipments',
      data: { type: 'create', resource: 'inventory_purchase_order_shipments', resourceId: result.id, data: result },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.status(201).json({ data: normalizeDateOnlyFields(result) });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order shipment create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/inventory-purchase-order-shipments/:id/composite
 * Update shipment and replace its items
 */
router.put('/:id/composite', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const shipmentId = parseRequiredPositiveInt(req.params.id, 'id');
    const { shipment, inventory_purchase_order_shipment: shipmentAlias, items } = req.body || {};
    const shipmentInput = shipment ?? shipmentAlias ?? {};

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const [existing] = await scopedDb
          .select()
          .from(inventoryPurchaseOrderShipments)
          .where(and(
            eq(inventoryPurchaseOrderShipments.customerId, scope.customerId),
            eq(inventoryPurchaseOrderShipments.id, shipmentId)
          ))
          .limit(1);

        if (!existing) {
          throw new ValidationError('Shipment not found', 404);
        }

        // Ignore purchaseOrderId if it matches existing (client may send full object)
        // Only error if trying to actually change it
        const incomingPoId = shipmentInput.purchaseOrderId ?? shipmentInput.purchase_order_id;
        if (incomingPoId !== undefined && Number(incomingPoId) !== existing.purchaseOrderId) {
          throw new ValidationError('purchaseOrderId cannot be changed');
        }

        const updates: Record<string, any> = { updatedAt: new Date() };

        if (shipmentInput.trackingNumber !== undefined || shipmentInput.tracking_number !== undefined) {
          updates.trackingNumber = requireString(
            shipmentInput.trackingNumber ?? shipmentInput.tracking_number,
            'trackingNumber'
          );
        }
        if (shipmentInput.carrier !== undefined) {
          updates.carrier = parseOptionalString(shipmentInput.carrier) ?? null;
        }
        if (shipmentInput.status !== undefined) {
          updates.status = coerceStatus(shipmentInput.status);
        }
        if (shipmentInput.shippedAt !== undefined || shipmentInput.shipped_at !== undefined) {
          updates.shippedAt = parseOptionalDate(shipmentInput.shippedAt ?? shipmentInput.shipped_at, 'shippedAt');
        }
        if (shipmentInput.deliveredAt !== undefined || shipmentInput.delivered_at !== undefined) {
          updates.deliveredAt = parseOptionalDate(shipmentInput.deliveredAt ?? shipmentInput.delivered_at, 'deliveredAt');
        }
        if (shipmentInput.etaDate !== undefined || shipmentInput.eta_date !== undefined) {
          updates.etaDate = parseOptionalDateOnly(shipmentInput.etaDate ?? shipmentInput.eta_date, 'etaDate');
        }
        if (shipmentInput.metadata !== undefined) {
          updates.metadata = parseOptionalJson(shipmentInput.metadata, 'metadata') ?? null;
        }

        const [updatedShipment] = await scopedDb
          .update(inventoryPurchaseOrderShipments)
          .set(updates)
          .where(eq(inventoryPurchaseOrderShipments.id, shipmentId))
          .returning();

        let finalItems: any[] = [];
        if (Array.isArray(items)) {
          await scopedDb
            .delete(inventoryPurchaseOrderShipmentItems)
            .where(eq(inventoryPurchaseOrderShipmentItems.shipmentId, shipmentId));

          if (items.length > 0) {
            const itemIds = Array.from(new Set(items.map((item: any) =>
              parseRequiredPositiveInt(item.purchaseOrderItemId ?? item.purchase_order_item_id, 'purchaseOrderItemId')
            )));

            const poItemRows = await scopedDb
              .select({ id: inventoryPurchaseOrderItems.id })
              .from(inventoryPurchaseOrderItems)
              .where(and(
                eq(inventoryPurchaseOrderItems.purchaseOrderId, existing.purchaseOrderId),
                eq(inventoryPurchaseOrderItems.customerId, scope.customerId),
                inArray(inventoryPurchaseOrderItems.id, itemIds)
              ));

            if (poItemRows.length !== itemIds.length) {
              throw new ValidationError('One or more purchase order items are invalid for this purchase order');
            }

            const itemRows = items.map((item: any) => ({
              customerId: scope.customerId,
              shipmentId,
              purchaseOrderItemId: parseRequiredPositiveInt(
                item.purchaseOrderItemId ?? item.purchase_order_item_id,
                'purchaseOrderItemId'
              ),
              quantity: parseQuantity(item.quantity, 'quantity', 1),
              receivedQuantity: parseNonNegativeQuantity(item.receivedQuantity, 'receivedQuantity', 0),
              metadata: parseOptionalJson(item.metadata, 'metadata') ?? null,
            }));

            finalItems = await scopedDb
              .insert(inventoryPurchaseOrderShipmentItems)
              .values(itemRows)
              .returning();
          }
        } else {
          finalItems = await scopedDb
            .select()
            .from(inventoryPurchaseOrderShipmentItems)
            .where(eq(inventoryPurchaseOrderShipmentItems.shipmentId, shipmentId));
        }

        return { ...updatedShipment, items: finalItems };
      }
    );

    eventBus.broadcast({
      event: 'data_change:inventory_purchase_order_shipments',
      data: { type: 'update', resource: 'inventory_purchase_order_shipments', resourceId: result.id, data: result },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: normalizeDateOnlyFields(result) });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order shipment update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/inventory-purchase-order-shipments/:id
 * Delete shipment and its items (cascade)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const shipmentId = parseRequiredPositiveInt(req.params.id, 'id');

    const deleted = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const [existing] = await scopedDb
          .select()
          .from(inventoryPurchaseOrderShipments)
          .where(and(
            eq(inventoryPurchaseOrderShipments.customerId, scope.customerId),
            eq(inventoryPurchaseOrderShipments.id, shipmentId)
          ))
          .limit(1);

        if (!existing) {
          throw new ValidationError('Shipment not found', 404);
        }

        const [deletedRow] = await scopedDb
          .delete(inventoryPurchaseOrderShipments)
          .where(eq(inventoryPurchaseOrderShipments.id, shipmentId))
          .returning();

        return deletedRow;
      }
    );

    eventBus.broadcast({
      event: 'data_change:inventory_purchase_order_shipments',
      data: { type: 'delete', resource: 'inventory_purchase_order_shipments', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: normalizeDateOnlyFields(deleted) });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order shipment delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-purchase-order-shipments/bulk-import
 * 
 * Accepts line-item-centric data (as received from vendor reports) and transforms
 * to shipment-centric structure. Merges items by tracking number.
 * 
 * Input:
 * {
 *   purchaseOrderId: number,
 *   lineItems: [
 *     {
 *       purchaseOrderItemId: number,
 *       shipments: [
 *         {
 *           shipmentId?: number,        // existing shipment ID (null = find by tracking or create)
 *           carrier: string,
 *           trackingNumber: string,
 *           quantity: number,
 *           status?: string,
 *           shippedAt?: string
 *         }
 *       ]
 *     }
 *   ]
 * }
 * 
 * Behavior:
 * - Groups all items by trackingNumber
 * - For each unique tracking: finds existing shipment by (purchaseOrderId, trackingNumber) or creates new
 * - Replaces all shipment_items for affected shipments
 */
router.post('/bulk-import', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { purchaseOrderId, lineItems } = req.body || {};

    if (!purchaseOrderId) {
      throw new ValidationError('purchaseOrderId is required');
    }
    const poId = parseRequiredPositiveInt(purchaseOrderId, 'purchaseOrderId');

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      throw new ValidationError('lineItems array is required and must not be empty');
    }

    console.log('📦 SHIPMENT BULK IMPORT - poId:', poId, 'lineItems:', JSON.stringify(lineItems, null, 2));

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        // Verify PO exists and belongs to customer
        const [po] = await scopedDb
          .select({ id: inventoryPurchaseOrders.id })
          .from(inventoryPurchaseOrders)
          .where(and(
            eq(inventoryPurchaseOrders.customerId, scope.customerId),
            eq(inventoryPurchaseOrders.id, poId)
          ))
          .limit(1);

        if (!po) {
          throw new ValidationError('Purchase order not found', 404);
        }

        // Validate all purchaseOrderItemIds exist and belong to this PO
        const poItemIds = Array.from(new Set(
          lineItems.map((li: any) => parseRequiredPositiveInt(li.purchaseOrderItemId, 'purchaseOrderItemId'))
        ));

        const validPoItems = await scopedDb
          .select({ id: inventoryPurchaseOrderItems.id })
          .from(inventoryPurchaseOrderItems)
          .where(and(
            eq(inventoryPurchaseOrderItems.customerId, scope.customerId),
            eq(inventoryPurchaseOrderItems.purchaseOrderId, poId),
            inArray(inventoryPurchaseOrderItems.id, poItemIds)
          ));

        const validPoItemIds = new Set(validPoItems.map((i: { id: number }) => i.id));
        for (const id of poItemIds) {
          if (!validPoItemIds.has(id)) {
            throw new ValidationError(`purchaseOrderItemId ${id} not found or does not belong to this PO`);
          }
        }

        // Step 1: Transform line-item-centric to shipment-centric (merge by trackingNumber)
        const shipmentMap = new Map<string, {
          shipmentId: number | null;
          carrier: string | null;
          trackingNumber: string;
          status: ShipmentStatus;
          shippedAt: Date | null;
          items: Array<{ purchaseOrderItemId: number; quantity: number }>;
        }>();

        for (const lineItem of lineItems) {
          const poItemId = parseRequiredPositiveInt(lineItem.purchaseOrderItemId, 'purchaseOrderItemId');
          const shipments = lineItem.shipments ?? [];

          for (const s of shipments) {
            const trackingNumber = requireString(s.trackingNumber ?? s.tracking_number, 'trackingNumber');
            const key = trackingNumber.toUpperCase().trim();

            if (!shipmentMap.has(key)) {
              shipmentMap.set(key, {
                shipmentId: parseOptionalInteger(s.shipmentId ?? s.shipment_id, 'shipmentId') ?? null,
                carrier: parseOptionalString(s.carrier) ?? null,
                trackingNumber: trackingNumber.trim(),
                status: coerceStatus(s.status),
                shippedAt: parseOptionalDate(s.shippedAt ?? s.shipped_at, 'shippedAt') ?? null,
                items: []
              });
            }

            const existing = shipmentMap.get(key)!;
            // Update shipment-level fields if provided (last one wins, or could merge)
            if (s.carrier) existing.carrier = parseOptionalString(s.carrier) ?? existing.carrier;
            if (s.status) existing.status = coerceStatus(s.status);
            if (s.shippedAt || s.shipped_at) {
              existing.shippedAt = parseOptionalDate(s.shippedAt ?? s.shipped_at, 'shippedAt') ?? existing.shippedAt;
            }

            existing.items.push({
              purchaseOrderItemId: poItemId,
              quantity: parseQuantity(s.quantity, 'quantity', 1)
            });
          }
        }

        // Step 2: For each unique tracking, upsert shipment and replace items
        const processedShipments: any[] = [];

        for (const [, shipmentData] of shipmentMap) {
          let shipmentId = shipmentData.shipmentId;

          // Try to find existing shipment by tracking number if no ID provided
          if (!shipmentId) {
            const [existingShipment] = await scopedDb
              .select({ id: inventoryPurchaseOrderShipments.id })
              .from(inventoryPurchaseOrderShipments)
              .where(and(
                eq(inventoryPurchaseOrderShipments.customerId, scope.customerId),
                eq(inventoryPurchaseOrderShipments.purchaseOrderId, poId),
                eq(inventoryPurchaseOrderShipments.trackingNumber, shipmentData.trackingNumber)
              ))
              .limit(1);

            if (existingShipment) {
              shipmentId = existingShipment.id;
            }
          }

          let shipment: any;

          if (shipmentId) {
            // Update existing shipment
            const [updated] = await scopedDb
              .update(inventoryPurchaseOrderShipments)
              .set({
                carrier: shipmentData.carrier,
                status: shipmentData.status,
                shippedAt: shipmentData.shippedAt,
                updatedAt: new Date()
              })
              .where(and(
                eq(inventoryPurchaseOrderShipments.id, shipmentId),
                eq(inventoryPurchaseOrderShipments.customerId, scope.customerId)
              ))
              .returning();

            shipment = updated;

            // Delete existing items for this shipment (will replace)
            await scopedDb
              .delete(inventoryPurchaseOrderShipmentItems)
              .where(eq(inventoryPurchaseOrderShipmentItems.shipmentId, shipmentId));
          } else {
            // Create new shipment
            const [created] = await scopedDb
              .insert(inventoryPurchaseOrderShipments)
              .values({
                customerId: scope.customerId,
                purchaseOrderId: poId,
                carrier: shipmentData.carrier,
                trackingNumber: shipmentData.trackingNumber,
                status: shipmentData.status,
                shippedAt: shipmentData.shippedAt
              })
              .returning();

            shipment = created;
            shipmentId = created.id;
          }

          // Insert shipment items
          if (shipmentData.items.length > 0) {
            const itemRows = shipmentData.items.map((item, idx) => ({
              customerId: scope.customerId,
              shipmentId: shipmentId!,
              purchaseOrderItemId: item.purchaseOrderItemId,
              quantity: item.quantity,
              receivedQuantity: 0,
              sortOrder: idx
            }));

            const insertedItems = await scopedDb
              .insert(inventoryPurchaseOrderShipmentItems)
              .values(itemRows)
              .returning();

            shipment.items = insertedItems;
          } else {
            shipment.items = [];
          }

          processedShipments.push(shipment);
        }

        return processedShipments;
      }
    );

    // Broadcast changes
    for (const shipment of result) {
      eventBus.broadcast({
        event: 'data_change:inventory_purchase_order_shipments',
        data: { 
          type: shipment.createdAt === shipment.updatedAt ? 'create' : 'update', 
          resource: 'inventory_purchase_order_shipments', 
          resourceId: shipment.id, 
          data: shipment 
        },
        meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
      });
    }

    res.status(201).json({ 
      data: normalizeDateOnlyFieldsArray(result), 
      meta: { 
        shipmentsProcessed: result.length,
        totalItems: result.reduce((sum: number, s: any) => sum + (s.items?.length || 0), 0)
      } 
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Shipment bulk import error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-purchase-order-shipments/bulk-update
 * 
 * Bulk update multiple shipments with the same field values.
 * Only updates fields that are explicitly provided (not null/undefined).
 * 
 * Input:
 * {
 *   "_selectedShipmentIds": [1, 2, 3],
 *   "shippedAt": "2026-01-11T10:00:00.000Z",  // or undefined to skip
 *   "etaDate": null,                          // null = skip (preserve existing)
 *   "deliveredAt": null,
 *   "status": "in_transit"
 * }
 * 
 * Behavior:
 * - Only fields with non-null, non-undefined values are updated
 * - null means "don't update this field" (preserve existing value)
 */
router.post('/bulk-update', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { _selectedShipmentIds, ...updates } = req.body || {};

    if (!Array.isArray(_selectedShipmentIds) || _selectedShipmentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No shipments selected' });
    }

    // Parse and validate shipment IDs
    const shipmentIds = _selectedShipmentIds
      .map(id => typeof id === 'number' ? id : parseInt(id, 10))
      .filter(id => Number.isFinite(id) && id > 0);

    if (shipmentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid shipment IDs provided' });
    }

    // Build update object with only non-null, non-undefined fields
    const fieldsToUpdate: Record<string, any> = {};

    if (updates.status !== null && updates.status !== undefined) {
      fieldsToUpdate.status = coerceStatus(updates.status);
    }
    if (updates.carrier !== null && updates.carrier !== undefined) {
      fieldsToUpdate.carrier = parseOptionalString(updates.carrier) ?? null;
    }
    if (updates.shippedAt !== null && updates.shippedAt !== undefined) {
      fieldsToUpdate.shippedAt = parseOptionalDate(updates.shippedAt, 'shippedAt');
    }
    if (updates.deliveredAt !== null && updates.deliveredAt !== undefined) {
      fieldsToUpdate.deliveredAt = parseOptionalDate(updates.deliveredAt, 'deliveredAt');
    }
    if (updates.etaDate !== null && updates.etaDate !== undefined) {
      fieldsToUpdate.etaDate = parseOptionalDateOnly(updates.etaDate, 'etaDate');
    }
    if (updates.metadata !== null && updates.metadata !== undefined) {
      fieldsToUpdate.metadata = parseOptionalJson(updates.metadata, 'metadata') ?? null;
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.json({ success: true, updated: 0, message: 'No fields to update' });
    }

    // Always set updatedAt
    fieldsToUpdate.updatedAt = new Date();

    console.log('📦 SHIPMENT BULK UPDATE - ids:', shipmentIds, 'fields:', fieldsToUpdate);

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        // Verify all shipments belong to customer
        const existingShipments = await scopedDb
          .select({ id: inventoryPurchaseOrderShipments.id })
          .from(inventoryPurchaseOrderShipments)
          .where(and(
            eq(inventoryPurchaseOrderShipments.customerId, scope.customerId),
            inArray(inventoryPurchaseOrderShipments.id, shipmentIds)
          ));

        const validIds = existingShipments.map((s: { id: number }) => s.id);
        if (validIds.length === 0) {
          throw new ValidationError('No valid shipments found for update', 404);
        }

        // Perform bulk update
        const updated = await scopedDb
          .update(inventoryPurchaseOrderShipments)
          .set(fieldsToUpdate)
          .where(and(
            eq(inventoryPurchaseOrderShipments.customerId, scope.customerId),
            inArray(inventoryPurchaseOrderShipments.id, validIds)
          ))
          .returning();

        return updated;
      }
    );

    // Broadcast changes for each updated shipment
    for (const shipment of result) {
      eventBus.broadcast({
        event: 'data_change:inventory_purchase_order_shipments',
        data: { 
          type: 'update', 
          resource: 'inventory_purchase_order_shipments', 
          resourceId: shipment.id, 
          data: shipment 
        },
        meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
      });
    }

    res.json({ 
      success: true, 
      updated: result.length,
      data: normalizeDateOnlyFieldsArray(result)
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    console.error('Shipment bulk update error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

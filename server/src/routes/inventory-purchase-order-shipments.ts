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
} from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalInteger,
  parseOptionalString,
  parseOptionalDate,
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

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
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

    res.json({ data: result });
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
    const { shipment, items = [] } = req.body || {};

    if (!shipment) {
      return res.status(400).json({ error: 'shipment is required' });
    }

    const purchaseOrderId = parseRequiredPositiveInt(
      shipment.purchaseOrderId ?? shipment.purchase_order_id,
      'purchaseOrderId'
    );
    const trackingNumber = requireString(
      shipment.trackingNumber ?? shipment.tracking_number,
      'trackingNumber'
    );
    const status = coerceStatus(shipment.status);

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
            carrier: parseOptionalString(shipment.carrier) ?? null,
            trackingNumber,
            status,
            shippedAt: parseOptionalDate(shipment.shippedAt ?? shipment.shipped_at, 'shippedAt'),
            deliveredAt: parseOptionalDate(shipment.deliveredAt ?? shipment.delivered_at, 'deliveredAt'),
            etaDate: parseOptionalDate(shipment.etaDate ?? shipment.eta_date, 'etaDate'),
            metadata: parseOptionalJson(shipment.metadata, 'metadata') ?? null,
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

    res.status(201).json({ data: result });
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
    const { shipment = {}, items } = req.body || {};

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

        if (shipment.purchaseOrderId !== undefined || shipment.purchase_order_id !== undefined) {
          throw new ValidationError('purchaseOrderId cannot be changed');
        }

        const updates: Record<string, any> = { updatedAt: new Date() };

        if (shipment.trackingNumber !== undefined || shipment.tracking_number !== undefined) {
          updates.trackingNumber = requireString(
            shipment.trackingNumber ?? shipment.tracking_number,
            'trackingNumber'
          );
        }
        if (shipment.carrier !== undefined) {
          updates.carrier = parseOptionalString(shipment.carrier) ?? null;
        }
        if (shipment.status !== undefined) {
          updates.status = coerceStatus(shipment.status);
        }
        if (shipment.shippedAt !== undefined || shipment.shipped_at !== undefined) {
          updates.shippedAt = parseOptionalDate(shipment.shippedAt ?? shipment.shipped_at, 'shippedAt');
        }
        if (shipment.deliveredAt !== undefined || shipment.delivered_at !== undefined) {
          updates.deliveredAt = parseOptionalDate(shipment.deliveredAt ?? shipment.delivered_at, 'deliveredAt');
        }
        if (shipment.etaDate !== undefined || shipment.eta_date !== undefined) {
          updates.etaDate = parseOptionalDate(shipment.etaDate ?? shipment.eta_date, 'etaDate');
        }
        if (shipment.metadata !== undefined) {
          updates.metadata = parseOptionalJson(shipment.metadata, 'metadata') ?? null;
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

    res.json({ data: result });
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

    res.json({ data: deleted });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order shipment delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

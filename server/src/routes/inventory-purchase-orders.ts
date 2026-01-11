/**
 * Inventory Purchase Orders API
 * Handles composite create/update with nested line items
 */
import { Router } from 'express';
import { withTenantScope } from '../db/index.js';
import {
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  inventoryActionRequests,
  eq,
  and,
  inArray,
  desc,
  asc,
} from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';
import { eventBus } from '../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalInteger,
  parseOptionalString,
  parseOptionalDecimal,
  parsePagination,
} from './shared/validation.js';

const router = Router();

const PO_STATUS_VALUES = ['draft', 'pending_vendor', 'ordered', 'receiving', 'closed', 'canceled'] as const;
type POStatus = (typeof PO_STATUS_VALUES)[number];
const PO_STATUS_SET = new Set<POStatus>(PO_STATUS_VALUES);

const coerceStatus = (value: unknown): POStatus => {
  if (value === undefined || value === null || value === '') return 'draft';
  const status = String(value) as POStatus;
  if (!PO_STATUS_SET.has(status)) {
    throw new ValidationError(`status must be one of ${PO_STATUS_VALUES.join(', ')}`);
  }
  return status;
};

async function generatePurchaseNumber(scopedDb: any, customerId: number): Promise<string> {
  const prefix = 'PO';
  const result = await scopedDb
    .select({ purchaseNumber: inventoryPurchaseOrders.purchaseNumber })
    .from(inventoryPurchaseOrders)
    .where(eq(inventoryPurchaseOrders.customerId, customerId))
    .orderBy(desc(inventoryPurchaseOrders.id))
    .limit(1);

  if (result.length === 0) {
    return `${prefix}-0001`;
  }

  const lastNumber = result[0].purchaseNumber;
  const match = lastNumber.match(/(\d+)$/);
  const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

/**
 * GET /api/inventory-purchase-orders
 * List purchase orders with pagination
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { vendor_id, status, sort = 'createdAt', order = 'desc' } = req.query;
    const { limit, offset } = parsePagination(req.query.limit, req.query.offset);

    const whereConditions: any[] = [eq(inventoryPurchaseOrders.customerId, scope.customerId)];

    if (vendor_id) {
      whereConditions.push(eq(inventoryPurchaseOrders.vendorId, parseInt(vendor_id as string)));
    }
    if (status) {
      whereConditions.push(eq(inventoryPurchaseOrders.status, status as POStatus));
    }

    const sortColumn = sort === 'purchaseNumber' ? inventoryPurchaseOrders.purchaseNumber :
                       sort === 'totalAmount' ? inventoryPurchaseOrders.totalAmount :
                       sort === 'status' ? inventoryPurchaseOrders.status :
                       inventoryPurchaseOrders.createdAt;
    const orderBy = order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(inventoryPurchaseOrders)
          .where(and(...whereConditions))
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset);
      }
    );

    res.json({ data: rows, meta: { count: rows.length, limit, offset } });
  } catch (error: any) {
    console.error('Purchase orders GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/inventory-purchase-orders/:id
 * Get a single purchase order with its line items
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = parseInt(req.params.id, 10);

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const [po] = await scopedDb
          .select()
          .from(inventoryPurchaseOrders)
          .where(and(
            eq(inventoryPurchaseOrders.id, id),
            eq(inventoryPurchaseOrders.customerId, scope.customerId)
          ))
          .limit(1);

        if (!po) return null;

        const lineItems = await scopedDb
          .select()
          .from(inventoryPurchaseOrderItems)
          .where(eq(inventoryPurchaseOrderItems.purchaseOrderId, id))
          .orderBy(asc(inventoryPurchaseOrderItems.id));

        return { ...po, lineItems };
      }
    );

    if (!result) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    res.json({ data: result });
  } catch (error: any) {
    console.error('Purchase order GET by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-purchase-orders/composite
 * Create a purchase order with line items in a single transaction
 * Body: { inventory_purchase_order: {...}, lineItems: [...] }
 */
router.post('/composite', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { inventory_purchase_order: poInput, lineItems = [] } = req.body || {};

    if (!poInput) {
      return res.status(400).json({ error: 'inventory_purchase_order is required' });
    }

    const vendorId = parseOptionalInteger(poInput.vendorId, 'vendorId');
    if (!vendorId) {
      return res.status(400).json({ error: 'vendorId is required' });
    }

    const status = coerceStatus(poInput.status);

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const purchaseNumber = poInput.purchaseNumber?.trim() || await generatePurchaseNumber(scopedDb, scope.customerId);

        const [createdPO] = await scopedDb
          .insert(inventoryPurchaseOrders)
          .values({
            customerId: scope.customerId,
            vendorId,
            purchaseNumber,
            status,
            createdByUserId: (req as any).user?.id ? Number((req as any).user.id) : null,
            assignedToUserId: parseOptionalInteger(poInput.assignedToUserId, 'assignedToUserId'),
            totalAmount: parseOptionalDecimal(poInput.totalAmount, 'totalAmount') ?? '0',
            shippingAmount: parseOptionalDecimal(poInput.shippingAmount, 'shippingAmount') ?? '0',
            taxAmount: parseOptionalDecimal(poInput.taxAmount, 'taxAmount') ?? '0',
            dutiesAmount: parseOptionalDecimal(poInput.dutiesAmount, 'dutiesAmount') ?? '0',
            currency: poInput.currency?.trim() || 'USD',
            notes: parseOptionalString(poInput.notes),
            metadata: poInput.metadata ?? null,
            submittedAt: poInput.submittedAt ? new Date(poInput.submittedAt) : null,
            acknowledgedAt: poInput.acknowledgedAt ? new Date(poInput.acknowledgedAt) : null,
            closedAt: poInput.closedAt ? new Date(poInput.closedAt) : null,
          })
          .returning();

        let createdItems: any[] = [];
        if (Array.isArray(lineItems) && lineItems.length > 0) {
          const itemRows = lineItems.map((item: any, idx: number) => ({
            customerId: scope.customerId,
            purchaseOrderId: createdPO.id,
            actionRequestId: parseOptionalInteger(item.actionRequestId, 'actionRequestId'),
            skuId: parseOptionalInteger(item.skuId, 'skuId'),
            description: parseOptionalString(item.description),
            orderedQuantity: item.orderedQuantity ? parseInt(item.orderedQuantity) : 1,
            receivedQuantity: item.receivedQuantity ? parseInt(item.receivedQuantity) : 0,
            unitPriceSnapshot: parseOptionalDecimal(item.unitPriceSnapshot, 'unitPriceSnapshot'),
            extendedPrice: parseOptionalDecimal(item.extendedPrice, 'extendedPrice'),
            metadata: item.metadata ?? null,
          }));

          createdItems = await scopedDb
            .insert(inventoryPurchaseOrderItems)
            .values(itemRows)
            .returning();

          const actionRequestIds = createdItems
            .map(i => i.actionRequestId)
            .filter((id): id is number => id != null);

          if (actionRequestIds.length > 0) {
            await scopedDb
              .update(inventoryActionRequests)
              .set({ currentPurchaseOrderId: createdPO.id, updatedAt: new Date() })
              .where(and(
                eq(inventoryActionRequests.customerId, scope.customerId),
                inArray(inventoryActionRequests.id, actionRequestIds)
              ));
          }
        }

        return { ...createdPO, lineItems: createdItems };
      }
    );

    eventBus.broadcast({
      event: 'data_change:inventory_purchase_orders',
      data: { type: 'create', resource: 'inventory_purchase_orders', resourceId: result.id, data: result },
      meta: { timestamp: Date.now(), source: 'api' }
    });

    res.status(201).json({ data: result });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order composite POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/inventory-purchase-orders/:id/composite
 * Update a purchase order and its line items
 * Body: { inventory_purchase_order: {...}, lineItems: [...] }
 */
router.put('/:id/composite', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = parseInt(req.params.id, 10);
    const { inventory_purchase_order: poInput, lineItems } = req.body || {};

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const [existing] = await scopedDb
          .select()
          .from(inventoryPurchaseOrders)
          .where(and(
            eq(inventoryPurchaseOrders.id, id),
            eq(inventoryPurchaseOrders.customerId, scope.customerId)
          ))
          .limit(1);

        if (!existing) {
          throw new ValidationError('Purchase order not found', 404);
        }

        const updates: Record<string, any> = { updatedAt: new Date() };

        if (poInput) {
          if (poInput.purchaseNumber !== undefined || poInput.purchase_number !== undefined) {
            const purchaseNumber = parseOptionalString(poInput.purchaseNumber ?? poInput.purchase_number);
            if (!purchaseNumber) {
              throw new ValidationError('purchaseNumber cannot be blank');
            }
            updates.purchaseNumber = purchaseNumber;
          }
          if (poInput.vendorId !== undefined) updates.vendorId = parseOptionalInteger(poInput.vendorId, 'vendorId');
          if (poInput.status !== undefined) updates.status = coerceStatus(poInput.status);
          if (poInput.assignedToUserId !== undefined) updates.assignedToUserId = parseOptionalInteger(poInput.assignedToUserId, 'assignedToUserId');
          if (poInput.totalAmount !== undefined) updates.totalAmount = parseOptionalDecimal(poInput.totalAmount, 'totalAmount') ?? '0';
          if (poInput.shippingAmount !== undefined) updates.shippingAmount = parseOptionalDecimal(poInput.shippingAmount, 'shippingAmount') ?? '0';
          if (poInput.taxAmount !== undefined) updates.taxAmount = parseOptionalDecimal(poInput.taxAmount, 'taxAmount') ?? '0';
          if (poInput.dutiesAmount !== undefined) updates.dutiesAmount = parseOptionalDecimal(poInput.dutiesAmount, 'dutiesAmount') ?? '0';
          if (poInput.currency !== undefined) updates.currency = poInput.currency?.trim() || 'USD';
          if (poInput.notes !== undefined) updates.notes = parseOptionalString(poInput.notes);
          if (poInput.metadata !== undefined) updates.metadata = poInput.metadata;
          if (poInput.submittedAt !== undefined) updates.submittedAt = poInput.submittedAt ? new Date(poInput.submittedAt) : null;
          if (poInput.acknowledgedAt !== undefined) updates.acknowledgedAt = poInput.acknowledgedAt ? new Date(poInput.acknowledgedAt) : null;
          if (poInput.closedAt !== undefined) updates.closedAt = poInput.closedAt ? new Date(poInput.closedAt) : null;
        }

        const [updatedPO] = await scopedDb
          .update(inventoryPurchaseOrders)
          .set(updates)
          .where(eq(inventoryPurchaseOrders.id, id))
          .returning();

        let finalItems: any[] = [];
        if (Array.isArray(lineItems)) {
          const existingItems = await scopedDb
            .select({ actionRequestId: inventoryPurchaseOrderItems.actionRequestId })
            .from(inventoryPurchaseOrderItems)
            .where(eq(inventoryPurchaseOrderItems.purchaseOrderId, id));

          const previousActionRequestIds = existingItems
            .map((item) => item.actionRequestId)
            .filter((arId): arId is number => arId != null);

          await scopedDb
            .delete(inventoryPurchaseOrderItems)
            .where(eq(inventoryPurchaseOrderItems.purchaseOrderId, id));

          if (lineItems.length > 0) {
            const itemRows = lineItems.map((item: any) => ({
              customerId: scope.customerId,
              purchaseOrderId: id,
              actionRequestId: parseOptionalInteger(item.actionRequestId, 'actionRequestId'),
              skuId: parseOptionalInteger(item.skuId, 'skuId'),
              description: parseOptionalString(item.description),
              orderedQuantity: item.orderedQuantity ? parseInt(item.orderedQuantity) : 1,
              receivedQuantity: item.receivedQuantity ? parseInt(item.receivedQuantity) : 0,
              unitPriceSnapshot: parseOptionalDecimal(item.unitPriceSnapshot, 'unitPriceSnapshot'),
              extendedPrice: parseOptionalDecimal(item.extendedPrice, 'extendedPrice'),
              metadata: item.metadata ?? null,
            }));

            finalItems = await scopedDb
              .insert(inventoryPurchaseOrderItems)
              .values(itemRows)
              .returning();

            const actionRequestIds = Array.from(new Set(
              finalItems
                .map((item) => item.actionRequestId)
                .filter((arId): arId is number => arId != null)
            ));

            if (actionRequestIds.length > 0) {
              await scopedDb
                .update(inventoryActionRequests)
                .set({ currentPurchaseOrderId: id, updatedAt: new Date() })
                .where(and(
                  eq(inventoryActionRequests.customerId, scope.customerId),
                  inArray(inventoryActionRequests.id, actionRequestIds)
                ));
            }
          }

          if (previousActionRequestIds.length > 0) {
            const currentActionRequestIdSet = new Set(
              finalItems
                .map((item) => item.actionRequestId)
                .filter((arId): arId is number => arId != null)
            );

            const removedActionRequestIds = Array.from(new Set(previousActionRequestIds))
              .filter((arId) => !currentActionRequestIdSet.has(arId));

            if (removedActionRequestIds.length > 0) {
              await scopedDb
                .update(inventoryActionRequests)
                .set({ currentPurchaseOrderId: null, updatedAt: new Date() })
                .where(and(
                  eq(inventoryActionRequests.customerId, scope.customerId),
                  inArray(inventoryActionRequests.id, removedActionRequestIds)
                ));
            }
          }
        } else {
          finalItems = await scopedDb
            .select()
            .from(inventoryPurchaseOrderItems)
            .where(eq(inventoryPurchaseOrderItems.purchaseOrderId, id));
        }

        return { ...updatedPO, lineItems: finalItems };
      }
    );

    eventBus.broadcast({
      event: 'data_change:inventory_purchase_orders',
      data: { type: 'update', resource: 'inventory_purchase_orders', resourceId: result.id, data: result },
      meta: { timestamp: Date.now(), source: 'api' }
    });

    res.json({ data: result });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order composite PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/inventory-purchase-orders/:id
 * Delete a purchase order and its line items (cascade)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = parseInt(req.params.id, 10);

    const deleted = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const [existing] = await scopedDb
          .select()
          .from(inventoryPurchaseOrders)
          .where(and(
            eq(inventoryPurchaseOrders.id, id),
            eq(inventoryPurchaseOrders.customerId, scope.customerId)
          ))
          .limit(1);

        if (!existing) {
          throw new ValidationError('Purchase order not found', 404);
        }

        await scopedDb
          .update(inventoryActionRequests)
          .set({ currentPurchaseOrderId: null, updatedAt: new Date() })
          .where(eq(inventoryActionRequests.currentPurchaseOrderId, id));

        const [deletedPO] = await scopedDb
          .delete(inventoryPurchaseOrders)
          .where(eq(inventoryPurchaseOrders.id, id))
          .returning();

        return deletedPO;
      }
    );

    eventBus.broadcast({
      event: 'data_change:inventory_purchase_orders',
      data: { type: 'delete', resource: 'inventory_purchase_orders', resourceId: deleted.id, data: deleted },
      meta: { timestamp: Date.now(), source: 'api' }
    });

    res.json({ data: deleted });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Purchase order DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

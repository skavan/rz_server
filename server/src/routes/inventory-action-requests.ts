import { Router } from 'express';
import {
  inventoryActionRequests,
  inventoryItems,
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  issues,
  eq,
  ne,
  and,
  inArray,
  ilike,
  or,
  asc,
  desc,
} from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { withTenantScope } from '../db/index.js';
import { eventBus } from '../utils/event-bus.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { getRequestScope, type RequestScope } from '../utils/scope.js';
import {
  ValidationError,
  assignIfDefined,
  ensureHomeAccess,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalDateOnly,
  parseOptionalDecimal,
  parseOptionalInteger,
  parseOptionalJson,
  parseOptionalString,
  parsePagination,
  requireNumber,
} from './shared/validation.js';

const router = Router();
type InventoryActionRequestRow = typeof inventoryActionRequests.$inferSelect;

const ACTION_TYPE_VALUES = ['replace', 'repair', 'claim'] as const;
type ActionType = (typeof ACTION_TYPE_VALUES)[number];
const PROCUREMENT_STATUS_VALUES = [
  'pending',
  'in_review',
  'ready_for_order',
  'queued_for_po',
  'ordered',
  'fulfilled',
  'canceled',
] as const;
type ProcurementStatus = (typeof PROCUREMENT_STATUS_VALUES)[number];
const REPAIR_STATUS_VALUES = [
  'not_applicable',
  'pending',
  'awaiting_vendor',
  'in_service',
  'completed',
  'canceled',
] as const;
type RepairStatus = (typeof REPAIR_STATUS_VALUES)[number];
const SHIPPING_CHARGE_TYPE_VALUES = ['percent', 'fixed'] as const;
type ShippingChargeType = (typeof SHIPPING_CHARGE_TYPE_VALUES)[number];

const INCLUDE_TOKENS = new Set([
  'issue',
  'issues',
  'inventory_item',
  'inventory-items',
  'inventory_items',
  'inventory',
  'purchase_order',
  'purchase-orders',
  'purchase_orders',
  'po',
]);

const SORTABLE_COLUMNS: Record<string, any> = {
  id: inventoryActionRequests.id,
  createdat: inventoryActionRequests.createdAt,
  updatedat: inventoryActionRequests.updatedAt,
  eta: inventoryActionRequests.etaDate,
  etadate: inventoryActionRequests.etaDate,
  procurementstatus: inventoryActionRequests.procurementStatus,
  repairstatus: inventoryActionRequests.repairStatus,
  actiontype: inventoryActionRequests.actionType,
};

const pickValue = (source: Record<string, any>, ...keys: string[]): any => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      return source[key];
    }
  }
  return undefined;
};

const parseEnumValue = <T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[],
  options: { defaultValue?: T; required?: boolean } = {}
): T | undefined => {
  if (raw === undefined || raw === null || raw === '') {
    if (options.defaultValue !== undefined) return options.defaultValue;
    if (options.required) {
      throw new ValidationError(`${field} is required`);
    }
    return undefined;
  }
  const value = String(raw).trim().toLowerCase() as T;
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of ${allowed.join(', ')}`);
  }
  return value;
};

const parseEnumList = <T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[]
): T[] | undefined => {
  if (raw === undefined) return undefined;
  const values = Array.isArray(raw) ? raw : String(raw).split(',');
  const normalized: T[] = [];
  for (const token of values) {
    const value = String(token).trim().toLowerCase() as T;
    if (!value) continue;
    if (!allowed.includes(value)) {
      throw new ValidationError(`${field} must contain only ${allowed.join(', ')}`);
    }
    normalized.push(value);
  }
  return normalized;
};

const parseRequestedQuantity = (raw: unknown, options: { defaultValue?: number; optional?: boolean } = {}): number | undefined => {
  const parsed = parseOptionalInteger(raw, 'requestedQuantity');
  if (parsed === undefined) {
    if (options.optional) return undefined;
    return options.defaultValue ?? 1;
  }
  if (parsed === null) {
    throw new ValidationError('requestedQuantity cannot be null');
  }
  if (parsed <= 0) {
    throw new ValidationError('requestedQuantity must be greater than zero');
  }
  return parsed;
};

const parseBooleanField = (
  raw: unknown,
  field: string,
  options: { defaultValue?: boolean; optional?: boolean } = {}
): boolean | undefined => {
  const parsed = parseOptionalBoolean(raw, field);
  if (parsed === undefined) {
    if (options.optional) return undefined;
    return options.defaultValue;
  }
  if (parsed === null) {
    throw new ValidationError(`${field} cannot be null`);
  }
  return parsed;
};

const parseIncludeTokens = (raw: unknown): Set<string> => {
  if (raw === undefined) return new Set();
  const values = Array.isArray(raw) ? raw : String(raw).split(',');
  const set = new Set<string>();
  for (const token of values) {
    const normalized = String(token).trim().toLowerCase();
    if (normalized) {
      set.add(normalized);
    }
  }
  return set;
};

const buildDecimal = (raw: unknown, field: string): string | null | undefined => {
  const parsed = parseOptionalDecimal(raw, field);
  return parsed ?? null;
};

const buildDate = (raw: unknown, field: string): Date | null | undefined => {
  const parsed = parseOptionalDate(raw, field);
  return parsed ?? null;
};

/**
 * For DATE-only columns (no time component), extract YYYY-MM-DD from UTC.
 * Prevents timezone shift when storing date-only values.
 */
const buildDateOnly = (raw: unknown, field: string): string | null | undefined => {
  return parseOptionalDateOnly(raw, field) ?? null;
};

const setNullableInteger = (
  target: Record<string, any>,
  key: keyof typeof inventoryActionRequests,
  raw: unknown,
  field: string,
  scope?: RequestScope,
  { enforceHomeAccess }: { enforceHomeAccess?: boolean } = {}
) => {
  const parsed = parseOptionalInteger(raw, field);
  if (parsed !== undefined) {
    if (enforceHomeAccess && parsed !== null && scope) {
      ensureHomeAccess(scope, parsed);
    }
    assignIfDefined(target as any, key as any, parsed ?? null);
  }
};

type PricingSummary = {
  quantity: number;
  unitPrice: number | null;
  baseAmount: number | null;
  shippingType: ShippingChargeType | null;
  shippingValue: number | null;
  shippingAmount: number | null;
  totalAmount: number | null;
};

type InventoryActionRequestResponse = InventoryActionRequestRow & {
  pricingSummary: PricingSummary;
  calculatedTotal: number | null;
};

type PricingComputationSource = {
  requestedQuantity?: number | null;
  unitPriceEstimate?: string | number | null;
  shippingChargeType?: ShippingChargeType | null;
  shippingChargeValue?: string | number | null;
};

const toNumericValue = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const buildPricingSummary = (source: PricingComputationSource): PricingSummary => {
  const quantity = typeof source.requestedQuantity === 'number' && Number.isFinite(source.requestedQuantity)
    ? source.requestedQuantity
    : 1;
  const unitPrice = toNumericValue(source.unitPriceEstimate);
  const baseAmount = unitPrice != null ? roundCurrency(unitPrice * quantity) : null;
  const shippingValue = toNumericValue(source.shippingChargeValue);
  let shippingAmount: number | null = null;
  if (shippingValue != null) {
    if (source.shippingChargeType === 'percent') {
      if (baseAmount != null) {
        shippingAmount = roundCurrency(baseAmount * (shippingValue / 100));
      }
    } else if (source.shippingChargeType === 'fixed') {
      shippingAmount = roundCurrency(shippingValue);
    }
  }
  let totalAmount: number | null = null;
  if (baseAmount != null || shippingAmount != null) {
    totalAmount = roundCurrency((baseAmount ?? 0) + (shippingAmount ?? 0));
  }
  return {
    quantity,
    unitPrice,
    baseAmount,
    shippingType: source.shippingChargeType ?? null,
    shippingValue: shippingValue,
    shippingAmount,
    totalAmount,
  };
};

const attachPricingSummary = (row: InventoryActionRequestRow): InventoryActionRequestResponse => {
  const pricingSummary = buildPricingSummary(row);
  return {
    ...row,
    pricingSummary,
    calculatedTotal: pricingSummary.totalAmount,
  };
};

const formatDecimalValue = (value: number): string => roundCurrency(value).toFixed(2);

const BLOCKING_PROCUREMENT_STATUSES: ProcurementStatus[] = [
  'pending',
  'in_review',
  'ready_for_order',
  'queued_for_po',
  'ordered',
];

const hasBlockingInventoryRequest = async (
  scopedDb: any,
  params: { customerId: number; inventoryItemId: number; excludeId?: number }
): Promise<boolean> => {
  const predicates = [
    eq(inventoryActionRequests.customerId, params.customerId),
    eq(inventoryActionRequests.inventoryItemId, params.inventoryItemId),
    inArray(inventoryActionRequests.procurementStatus, BLOCKING_PROCUREMENT_STATUSES),
  ];

  if (params.excludeId) {
    predicates.push(ne(inventoryActionRequests.id, params.excludeId));
  }

  const rows = await scopedDb
    .select({ id: inventoryActionRequests.id })
    .from(inventoryActionRequests)
    .where(and(...predicates))
    .limit(1);

  return rows.length > 0;
};

const ensureClaimAmount = (
  target: Record<string, any>,
  options: { claimTouched: boolean; baseRow?: InventoryActionRequestRow | null }
): void => {
  if (options.claimTouched) return;
  if (target.claimAmount !== undefined && target.claimAmount !== null) return;
  const existingClaim = options.baseRow?.claimAmount;
  if (existingClaim !== undefined && existingClaim !== null) {
    return;
  }

  const pricingSource: PricingComputationSource = {
    requestedQuantity: target.requestedQuantity ?? options.baseRow?.requestedQuantity ?? 1,
    unitPriceEstimate: target.unitPriceEstimate ?? options.baseRow?.unitPriceEstimate ?? null,
    shippingChargeType: target.shippingChargeType ?? options.baseRow?.shippingChargeType ?? null,
    shippingChargeValue: target.shippingChargeValue ?? options.baseRow?.shippingChargeValue ?? null,
  };

  const summary = buildPricingSummary(pricingSource);
  if (summary.totalAmount == null) {
    return;
  }
  target.claimAmount = formatDecimalValue(summary.totalAmount);
  if (target.isClaimEstimate === undefined && (options.baseRow?.isClaimEstimate ?? null) == null) {
    target.isClaimEstimate = true;
  }
};

router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const {
      procurement_status,
      repair_status,
      action_type,
      issue_id,
      inventory_item_id,
      home_id,
      assigned_to_user_id,
      search,
      include,
      limit,
      offset,
      sort = 'updatedAt',
      order = 'desc',
    } = req.query as Record<string, string | undefined>;

    const filters: any[] = [eq(inventoryActionRequests.customerId, scope.customerId)];

    const procurementFilter = parseEnumList(procurement_status, 'procurement_status', PROCUREMENT_STATUS_VALUES);
    if (procurementFilter && procurementFilter.length > 0) {
      filters.push(inArray(inventoryActionRequests.procurementStatus, procurementFilter as ProcurementStatus[]));
    }

    const repairFilter = parseEnumList(repair_status, 'repair_status', REPAIR_STATUS_VALUES);
    if (repairFilter && repairFilter.length > 0) {
      filters.push(inArray(inventoryActionRequests.repairStatus, repairFilter as RepairStatus[]));
    }

    const actionFilter = parseEnumList(action_type, 'action_type', ACTION_TYPE_VALUES);
    if (actionFilter && actionFilter.length > 0) {
      filters.push(inArray(inventoryActionRequests.actionType, actionFilter as ActionType[]));
    }

    const issueFilter = parseOptionalInteger(issue_id, 'issue_id');
    if (issueFilter !== undefined) {
      if (issueFilter === null) {
        throw new ValidationError('issue_id must be numeric');
      }
      filters.push(eq(inventoryActionRequests.issueId, issueFilter));
    }

    const inventoryFilter = parseOptionalInteger(inventory_item_id, 'inventory_item_id');
    if (inventoryFilter !== undefined) {
      if (inventoryFilter === null) {
        throw new ValidationError('inventory_item_id must be numeric');
      }
      filters.push(eq(inventoryActionRequests.inventoryItemId, inventoryFilter));
    }

    const homeFilter = parseOptionalInteger(home_id, 'home_id');
    if (homeFilter !== undefined) {
      if (homeFilter === null) {
        throw new ValidationError('home_id must be numeric');
      }
      ensureHomeAccess(scope, homeFilter);
      filters.push(eq(inventoryActionRequests.homeId, homeFilter));
    }

    const assigneeFilter = parseOptionalInteger(assigned_to_user_id, 'assigned_to_user_id');
    if (assigneeFilter !== undefined) {
      if (assigneeFilter === null) {
        throw new ValidationError('assigned_to_user_id must be numeric');
      }
      filters.push(eq(inventoryActionRequests.assignedToUserId, assigneeFilter));
    }

    if (search) {
      const term = `%${search}%`;
      filters.push(
        or(
          ilike(inventoryActionRequests.fieldNotes, term),
          ilike(inventoryActionRequests.internalNotes, term),
          ilike(inventoryActionRequests.vendorNotes, term)
        )
      );
    }

    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    const sortKey = sort?.toLowerCase() ?? 'updatedat';
    const sortColumn = SORTABLE_COLUMNS[sortKey] ?? inventoryActionRequests.updatedAt;
    const orderBy = order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const { limit: parsedLimit, offset: parsedOffset } = parsePagination(limit, offset);

    const includeSet = parseIncludeTokens(include);
    const includeIssue = includeSet.has('issue') || includeSet.has('issues');
    const includeInventory =
      includeSet.has('inventory_item') || includeSet.has('inventory-items') || includeSet.has('inventory');
    const includePurchaseOrder =
      includeSet.has('purchase_order') || includeSet.has('purchase-orders') || includeSet.has('purchase_orders') || includeSet.has('po');

    const { rows, included } = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const rows = (await scopedDb
          .select()
          .from(inventoryActionRequests)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(parsedLimit)
          .offset(parsedOffset)) as InventoryActionRequestRow[];

        const included: Record<string, any> = {};

        if (includeIssue && rows.length > 0) {
          const issueIds: number[] = Array.from(
            new Set(rows.map((row) => row.issueId).filter((id): id is number => typeof id === 'number'))
          );
          if (issueIds.length > 0) {
            included.issues = await scopedDb
              .select()
              .from(issues)
              .where(and(eq(issues.customerId, scope.customerId), inArray(issues.id, issueIds)));
          }
        }

        if (includeInventory && rows.length > 0) {
          const inventoryIds: number[] = Array.from(
            new Set(rows.map((row) => row.inventoryItemId).filter((id): id is number => typeof id === 'number'))
          );
          if (inventoryIds.length > 0) {
            included.inventory_items = await scopedDb
              .select()
              .from(inventoryItems)
              .where(and(eq(inventoryItems.customerId, scope.customerId), inArray(inventoryItems.id, inventoryIds)));
          }
        }

        if (includePurchaseOrder && rows.length > 0) {
          const poIds: number[] = Array.from(
            new Set(
              rows
                .map((row) => row.currentPurchaseOrderId)
                .filter((id): id is number => typeof id === 'number')
            )
          );
          if (poIds.length > 0) {
            included.inventory_purchase_orders = await scopedDb
              .select()
              .from(inventoryPurchaseOrders)
              .where(and(eq(inventoryPurchaseOrders.customerId, scope.customerId), inArray(inventoryPurchaseOrders.id, poIds)));
          }
        }

        return { rows, included };
      }
    );

    const responseRows = rows.map(attachPricingSummary);

    const response: Record<string, any> = {
      data: responseRows,
      meta: {
        count: responseRows.length,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };

    if (Object.keys(included).length > 0) {
      response.included = included;
    }

    res.json(response);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('inventory-action-requests GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id parameter' });
    }

    const includeSet = parseIncludeTokens(req.query.include);
    const includeIssue = includeSet.has('issue') || includeSet.has('issues');
    const includeInventory =
      includeSet.has('inventory_item') || includeSet.has('inventory-items') || includeSet.has('inventory');
    const includePurchaseOrder =
      includeSet.has('purchase_order') || includeSet.has('purchase-orders') || includeSet.has('purchase_orders') || includeSet.has('po');

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const rows = (await scopedDb
          .select()
          .from(inventoryActionRequests)
          .where(and(eq(inventoryActionRequests.customerId, scope.customerId), eq(inventoryActionRequests.id, id)))
          .limit(1)) as InventoryActionRequestRow[];

        if (rows.length === 0) {
          return null;
        }

        const included: Record<string, any> = {};
        const record = rows[0];

        if (includeIssue) {
          included.issues = await scopedDb
            .select()
            .from(issues)
            .where(and(eq(issues.customerId, scope.customerId), eq(issues.id, record.issueId)))
            .limit(1);
        }

        if (includeInventory && record.inventoryItemId) {
          included.inventory_items = await scopedDb
            .select()
            .from(inventoryItems)
            .where(and(eq(inventoryItems.customerId, scope.customerId), eq(inventoryItems.id, record.inventoryItemId)))
            .limit(1);
        }

        if (includePurchaseOrder && record.currentPurchaseOrderId) {
          included.inventory_purchase_orders = await scopedDb
            .select()
            .from(inventoryPurchaseOrders)
            .where(
              and(
                eq(inventoryPurchaseOrders.customerId, scope.customerId),
                eq(inventoryPurchaseOrders.id, record.currentPurchaseOrderId)
              )
            )
            .limit(1);
        }

        return { record, included };
      }
    );

    if (!result) {
      return res.status(404).json({ error: 'Action request not found' });
    }

    const recordWithPricing = attachPricingSummary(result.record);
    const response: Record<string, any> = { data: recordWithPricing };
    if (Object.keys(result.included).length > 0) {
      response.included = result.included;
    }

    res.json(response);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('inventory-action-requests GET by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const applyWritableFields = (
  data: Record<string, any>,
  body: Record<string, any>,
  scope: RequestScope,
  options: { isUpdate?: boolean } = {}
): { statusesTouched: boolean; manualWorkflow?: Date | null; claimTouched: boolean } => {
  let statusesTouched = false;
  let claimTouched = false;

  const actionType = parseEnumValue(
    pickValue(body, 'actionType', 'action_type', 'requestType', 'request_type'),
    'actionType',
    ACTION_TYPE_VALUES,
    options.isUpdate ? {} : { defaultValue: 'replace' }
  );
  if (actionType !== undefined) {
    data.actionType = actionType;
    statusesTouched = true;
  }

  const procurementStatus = parseEnumValue(
    pickValue(body, 'procurementStatus', 'procurement_status', 'status'),
    'procurementStatus',
    PROCUREMENT_STATUS_VALUES,
    options.isUpdate ? {} : { defaultValue: 'pending' }
  );
  if (procurementStatus !== undefined) {
    data.procurementStatus = procurementStatus;
    statusesTouched = true;
  }

  const repairStatus = parseEnumValue(
    pickValue(body, 'repairStatus', 'repair_status'),
    'repairStatus',
    REPAIR_STATUS_VALUES,
    options.isUpdate ? {} : { defaultValue: 'not_applicable' }
  );
  if (repairStatus !== undefined) {
    data.repairStatus = repairStatus;
    statusesTouched = true;
  }

  const quantity = parseRequestedQuantity(
    pickValue(body, 'requestedQuantity', 'requested_quantity'),
    options.isUpdate ? { optional: true } : { defaultValue: 1 }
  );
  if (quantity !== undefined) {
    data.requestedQuantity = quantity;
  }

  assignIfDefined(data, 'fieldNotes', parseOptionalString(pickValue(body, 'fieldNotes', 'field_notes')) ?? null);
  assignIfDefined(data, 'internalNotes', parseOptionalString(pickValue(body, 'internalNotes', 'internal_notes')) ?? null);
  assignIfDefined(data, 'vendorNotes', parseOptionalString(pickValue(body, 'vendorNotes', 'vendor_notes')) ?? null);

  setNullableInteger(
    data,
    'homeId',
    pickValue(body, 'homeId', 'home_id'),
    'homeId',
    scope,
    { enforceHomeAccess: true }
  );
  setNullableInteger(data, 'inventoryItemId', pickValue(body, 'inventoryItemId', 'inventory_item_id'), 'inventoryItemId');
  setNullableInteger(data, 'productId', pickValue(body, 'productId', 'product_id'), 'productId');
  setNullableInteger(data, 'currentSkuId', pickValue(body, 'currentSkuId', 'current_sku_id'), 'currentSkuId');
  setNullableInteger(
    data,
    'replacementSkuId',
    pickValue(body, 'replacementSkuId', 'replacement_sku_id'),
    'replacementSkuId'
  );
  setNullableInteger(
    data,
    'assignedToUserId',
    pickValue(body, 'assignedToUserId', 'assigned_to_user_id'),
    'assignedToUserId'
  );
  setNullableInteger(
    data,
    'decisionByUserId',
    pickValue(body, 'decisionByUserId', 'decision_by_user_id'),
    'decisionByUserId'
  );
  setNullableInteger(
    data,
    'preferredVendorId',
    pickValue(body, 'preferredVendorId', 'preferred_vendor_id'),
    'preferredVendorId'
  );
  setNullableInteger(
    data,
    'currentPurchaseOrderId',
    pickValue(body, 'currentPurchaseOrderId', 'purchase_order_id'),
    'currentPurchaseOrderId'
  );

  assignIfDefined(data, 'decisionMadeAt', buildDate(pickValue(body, 'decisionMadeAt', 'decision_made_at'), 'decisionMadeAt'));
  assignIfDefined(data, 'etaDate', buildDateOnly(pickValue(body, 'etaDate', 'eta_date'), 'etaDate'));
  assignIfDefined(
    data,
    'queuedForPoAt',
    buildDate(pickValue(body, 'queuedForPoAt', 'queued_for_po_at'), 'queuedForPoAt')
  );
  assignIfDefined(data, 'orderedAt', buildDate(pickValue(body, 'orderedAt', 'ordered_at'), 'orderedAt'));
  assignIfDefined(data, 'fulfilledAt', buildDate(pickValue(body, 'fulfilledAt', 'fulfilled_at'), 'fulfilledAt'));
  assignIfDefined(data, 'canceledAt', buildDate(pickValue(body, 'canceledAt', 'canceled_at'), 'canceledAt'));

  const leadTimeDays = parseOptionalInteger(pickValue(body, 'leadTimeDays', 'lead_time_days'), 'leadTimeDays');
  if (leadTimeDays !== undefined) {
    assignIfDefined(data, 'leadTimeDays', leadTimeDays ?? null);
  }
  const shippingTimeDays = parseOptionalInteger(
    pickValue(body, 'shippingTimeDays', 'shipping_time_days'),
    'shippingTimeDays'
  );
  if (shippingTimeDays !== undefined) {
    assignIfDefined(data, 'shippingTimeDays', shippingTimeDays ?? null);
  }

  assignIfDefined(
    data,
    'unitPriceEstimate',
    buildDecimal(pickValue(body, 'unitPriceEstimate', 'unit_price_estimate'), 'unitPriceEstimate')
  );
  const claimAmountValue = buildDecimal(pickValue(body, 'claimAmount', 'claim_amount'), 'claimAmount');
  if (claimAmountValue !== undefined) {
    claimTouched = true;
    data.claimAmount = claimAmountValue;
  }
  assignIfDefined(
    data,
    'shippingChargeValue',
    buildDecimal(pickValue(body, 'shippingChargeValue', 'shipping_charge_value'), 'shippingChargeValue')
  );

  const shippingChargeType = parseEnumValue(
    pickValue(body, 'shippingChargeType', 'shipping_charge_type'),
    'shippingChargeType',
    SHIPPING_CHARGE_TYPE_VALUES,
    { required: false }
  );
  if (shippingChargeType !== undefined) {
    data.shippingChargeType = shippingChargeType as ShippingChargeType;
  }

  const isClaimEstimate = parseBooleanField(
    pickValue(body, 'isClaimEstimate', 'is_claim_estimate'),
    'isClaimEstimate',
    options.isUpdate ? { optional: true } : { defaultValue: true }
  );
  if (isClaimEstimate !== undefined) {
    data.isClaimEstimate = isClaimEstimate;
  }

  const isInsuranceClaim = parseBooleanField(
    pickValue(body, 'isInsuranceClaim', 'is_insurance_claim'),
    'isInsuranceClaim',
    options.isUpdate ? { optional: true } : { defaultValue: false }
  );
  if (isInsuranceClaim !== undefined) {
    data.isInsuranceClaim = isInsuranceClaim;
  }

  const metadata = parseOptionalJson(pickValue(body, 'metadata', 'meta'), 'metadata');
  if (metadata !== undefined) {
    assignIfDefined(data, 'metadata', metadata ?? null);
  }
  const actionContext = parseOptionalJson(pickValue(body, 'actionContext', 'action_context'), 'actionContext');
  if (actionContext !== undefined) {
    assignIfDefined(data, 'actionContext', actionContext ?? null);
  }

  const manualWorkflow = buildDate(
    pickValue(body, 'lastWorkflowTouchedAt', 'last_workflow_touched_at'),
    'lastWorkflowTouchedAt'
  );

  return { statusesTouched, manualWorkflow, claimTouched };
};

router.post(
  '/',
  authenticateToken,
  autoInjectMiddleware('inventoryActionRequests', { requireWrite: true }),
  async (req, res) => {
    try {
      const scope = getScopeFromRequest(req as any);
      const body = req.body ?? {};
      const issueId = requireNumber(pickValue(body, 'issueId', 'issue_id'), 'issueId');
      const data: Record<string, any> = { issueId, customerId: scope.customerId };

      const { statusesTouched, manualWorkflow, claimTouched } = applyWritableFields(data, body, scope, { isUpdate: false });

      const createdBy = parseOptionalInteger(
        pickValue(body, 'createdByUserId', 'created_by_user_id'),
        'createdByUserId'
      );
      if (createdBy !== undefined) {
        assignIfDefined(data, 'createdByUserId', createdBy ?? null);
      } else {
        const authUserId = Number((req as any)?.user?.id);
        if (Number.isFinite(authUserId)) {
          data.createdByUserId = authUserId;
        }
      }

      const decisionBy = parseOptionalInteger(
        pickValue(body, 'decisionByUserId', 'decision_by_user_id'),
        'decisionByUserId'
      );
      if (decisionBy !== undefined) {
        assignIfDefined(data, 'decisionByUserId', decisionBy ?? null);
      }

      data.lastWorkflowTouchedAt = manualWorkflow ?? new Date();
      data.updatedAt = new Date();

      ensureClaimAmount(data, { claimTouched });

      const created = await withTenantScope(
        { customerId: scope.customerId, homeIds: scope.homeIds },
        async (scopedDb) => {
          const issueRows = await scopedDb
            .select({ id: issues.id, homeId: issues.homeId, entityType: issues.entityType, entityId: issues.entityId })
            .from(issues)
            .where(and(eq(issues.customerId, scope.customerId), eq(issues.id, issueId)))
            .limit(1);

          if (issueRows.length === 0) {
            throw new ValidationError('Issue not found or not accessible', 404);
          }

          const issueRow = issueRows[0];

          if (data.homeId === undefined && issueRow.homeId != null) {
            data.homeId = issueRow.homeId;
          }

          let resolvedInventoryItemId = data.inventoryItemId ?? null;
          if (resolvedInventoryItemId == null && issueRow.entityType === 'inventory_item') {
            resolvedInventoryItemId = issueRow.entityId;
          }

          if (resolvedInventoryItemId != null) {
            const alreadyExists = await hasBlockingInventoryRequest(scopedDb, {
              customerId: scope.customerId,
              inventoryItemId: resolvedInventoryItemId,
            });
            if (alreadyExists) {
              throw new ValidationError('This inventory item already has an active action request', 409);
            }
            data.inventoryItemId = resolvedInventoryItemId;
          }

          const inserted = (await scopedDb.insert(inventoryActionRequests).values(data).returning()) as InventoryActionRequestRow[];
          
          // Update the linked issue with action_request_id and requires_purchase
          await scopedDb
            .update(issues)
            .set({
              actionRequestId: inserted[0].id,
              requiresPurchase: true,
              updatedAt: new Date(),
            })
            .where(eq(issues.id, issueId));

          return inserted[0];
        }
      );

      const responsePayload = attachPricingSummary(created);

      eventBus.broadcast({
        event: 'data_change:inventory_action_requests',
        data: { type: 'create', resource: 'inventory_action_requests', resourceId: created.id, data: responsePayload },
        meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
      });

      res.status(201).json({ data: responsePayload });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('inventory-action-requests POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const body = req.body ?? {};
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id parameter' });
    }

    const data: Record<string, any> = {};
    const { statusesTouched, manualWorkflow, claimTouched } = applyWritableFields(data, body, scope, { isUpdate: true });

    const issueId = parseOptionalInteger(pickValue(body, 'issueId', 'issue_id'), 'issueId');
    if (issueId !== undefined) {
      if (issueId === null) {
        throw new ValidationError('issueId cannot be null');
      }
      data.issueId = issueId;
    }

    const touchWorkflow = parseBooleanField(
      pickValue(body, 'touchWorkflow', 'touch_workflow'),
      'touchWorkflow',
      { optional: true }
    );

    const manualLastTouched = manualWorkflow;
    if (manualLastTouched !== undefined) {
      data.lastWorkflowTouchedAt = manualLastTouched;
    } else if (touchWorkflow === true || statusesTouched) {
      data.lastWorkflowTouchedAt = new Date();
    }

    const metadata = parseOptionalJson(pickValue(body, 'metadata', 'meta'), 'metadata');
    if (metadata !== undefined) {
      assignIfDefined(data, 'metadata', metadata ?? null);
    }
    const actionContext = parseOptionalJson(pickValue(body, 'actionContext', 'action_context'), 'actionContext');
    if (actionContext !== undefined) {
      assignIfDefined(data, 'actionContext', actionContext ?? null);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields supplied for update' });
    }

    data.updatedAt = new Date();

    const updated = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        if (issueId !== undefined) {
          const issueRows = await scopedDb
            .select({ id: issues.id })
            .from(issues)
            .where(and(eq(issues.customerId, scope.customerId), eq(issues.id, issueId)))
            .limit(1);
          if (issueRows.length === 0) {
            throw new ValidationError('Issue not found or not accessible', 404);
          }
        }

        const existingRows = (await scopedDb
          .select()
          .from(inventoryActionRequests)
          .where(and(eq(inventoryActionRequests.customerId, scope.customerId), eq(inventoryActionRequests.id, id)))
          .limit(1)) as InventoryActionRequestRow[];

        if (existingRows.length === 0) {
          return null;
        }

        const existing = existingRows[0];

        if (data.inventoryItemId !== undefined) {
          const incomingInventoryItemId = data.inventoryItemId;
          const existingInventoryItemId = existing.inventoryItemId ?? null;
          const hasChanged = incomingInventoryItemId !== existingInventoryItemId;
          if (incomingInventoryItemId != null && hasChanged) {
            const alreadyExists = await hasBlockingInventoryRequest(scopedDb, {
              customerId: scope.customerId,
              inventoryItemId: incomingInventoryItemId,
              excludeId: existing.id,
            });
            if (alreadyExists) {
              throw new ValidationError('This inventory item already has an active action request', 409);
            }
          }
        }

        ensureClaimAmount(data, { claimTouched, baseRow: existing });

        const rows = (await scopedDb
          .update(inventoryActionRequests)
          .set(data)
          .where(and(eq(inventoryActionRequests.customerId, scope.customerId), eq(inventoryActionRequests.id, id)))
          .returning()) as InventoryActionRequestRow[];
        return rows[0];
      }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Action request not found' });
    }

    const responsePayload = attachPricingSummary(updated);

    eventBus.broadcast({
      event: 'data_change:inventory_action_requests',
      data: { type: 'update', resource: 'inventory_action_requests', resourceId: responsePayload.id, data: responsePayload },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ data: responsePayload });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('inventory-action-requests PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id parameter' });
    }

    const deleted = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const existing = (await scopedDb
          .select()
          .from(inventoryActionRequests)
          .where(and(eq(inventoryActionRequests.customerId, scope.customerId), eq(inventoryActionRequests.id, id)))
          .limit(1)) as InventoryActionRequestRow[];

        if (existing.length === 0) {
          return null;
        }

        const linkedLineItem = await scopedDb
          .select({ id: inventoryPurchaseOrderItems.id })
          .from(inventoryPurchaseOrderItems)
          .where(and(
            eq(inventoryPurchaseOrderItems.customerId, scope.customerId),
            eq(inventoryPurchaseOrderItems.actionRequestId, id)
          ))
          .limit(1);

        if (linkedLineItem.length > 0) {
          throw new ValidationError('Requests linked to a purchase order cannot be deleted', 409);
        }

        const removed = (await scopedDb
          .delete(inventoryActionRequests)
          .where(and(eq(inventoryActionRequests.customerId, scope.customerId), eq(inventoryActionRequests.id, id)))
          .returning()) as InventoryActionRequestRow[];

        // Clear the action_request_id and requires_purchase on the linked issue
        if (removed[0]?.issueId) {
          await scopedDb
            .update(issues)
            .set({
              actionRequestId: null,
              requiresPurchase: false,
              updatedAt: new Date(),
            })
            .where(eq(issues.id, removed[0].issueId));
        }

        return removed[0] ?? null;
      }
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Action request not found' });
    }

    const responsePayload = attachPricingSummary(deleted);

    eventBus.broadcast({
      event: 'data_change:inventory_action_requests',
      data: { type: 'delete', resource: 'inventory_action_requests', resourceId: responsePayload.id, data: responsePayload },
      meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
    });

    res.json({ message: 'Action request deleted', data: responsePayload });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('inventory-action-requests DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inventory-action-requests/bulk
 * Create multiple action requests in a single transaction
 * Body: {
 *   items: [{ issueId, skuId?, inventoryItemId?, requestedQuantity?, ... }],
 *   defaults?: { actionType?, procurementStatus?, replacementSkuId?, preferredVendorId?, ... }
 * }
 * Response: { data: { created: number, skipped: number, ids: number[], errors: string[] } }
 */
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const { items = [], defaults = {} } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required and must not be empty' });
    }

    const authUserId = Number((req as any)?.user?.id) || null;

    const result = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const createdIds: number[] = [];
        const errors: string[] = [];
        let skipped = 0;

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          try {
            const issueId = parseOptionalInteger(pickValue(item, 'issueId', 'issue_id'), 'issueId');
            if (!issueId) {
              errors.push(`Item ${idx}: issueId is required`);
              skipped++;
              continue;
            }

            const issueRows = await scopedDb
              .select({ id: issues.id, homeId: issues.homeId, entityType: issues.entityType, entityId: issues.entityId })
              .from(issues)
              .where(and(eq(issues.customerId, scope.customerId), eq(issues.id, issueId)))
              .limit(1);

            if (issueRows.length === 0) {
              errors.push(`Item ${idx}: Issue ${issueId} not found`);
              skipped++;
              continue;
            }

            const issueRow = issueRows[0];

            let inventoryItemId = parseOptionalInteger(pickValue(item, 'inventoryItemId', 'inventory_item_id'), 'inventoryItemId');
            if (inventoryItemId == null && issueRow.entityType === 'inventory_item') {
              inventoryItemId = issueRow.entityId;
            }

            if (inventoryItemId != null) {
              const alreadyExists = await hasBlockingInventoryRequest(scopedDb, {
                customerId: scope.customerId,
                inventoryItemId,
              });
              if (alreadyExists) {
                errors.push(`Item ${idx}: Inventory item ${inventoryItemId} already has an active request`);
                skipped++;
                continue;
              }
            }

            const actionType = parseEnumValue(
              pickValue(item, 'actionType', 'action_type') ?? pickValue(defaults, 'actionType', 'action_type'),
              'actionType',
              ACTION_TYPE_VALUES,
              { defaultValue: 'replace' }
            ) as ActionType;

            const procurementStatus = parseEnumValue(
              pickValue(item, 'procurementStatus', 'procurement_status') ?? pickValue(defaults, 'procurementStatus', 'procurement_status'),
              'procurementStatus',
              PROCUREMENT_STATUS_VALUES,
              { defaultValue: 'pending' }
            ) as ProcurementStatus;

            const data: Record<string, any> = {
              customerId: scope.customerId,
              issueId,
              homeId: issueRow.homeId ?? parseOptionalInteger(pickValue(item, 'homeId', 'home_id'), 'homeId'),
              inventoryItemId: inventoryItemId ?? null,
              actionType,
              procurementStatus,
              repairStatus: 'not_applicable' as RepairStatus,
              requestedQuantity: parseOptionalInteger(pickValue(item, 'requestedQuantity', 'requested_quantity', 'itemQty', 'item_qty'), 'requestedQuantity') ?? 1,
              createdByUserId: authUserId,
              updatedAt: new Date(),
              lastWorkflowTouchedAt: new Date(),
            };

            const currentSkuId = parseOptionalInteger(
              pickValue(item, 'currentSkuId', 'current_sku_id', 'skuId', 'sku_id'),
              'currentSkuId'
            );
            if (currentSkuId !== undefined) data.currentSkuId = currentSkuId;

            const replacementSkuId = parseOptionalInteger(
              pickValue(item, 'replacementSkuId', 'replacement_sku_id') ?? pickValue(defaults, 'replacementSkuId', 'replacement_sku_id'),
              'replacementSkuId'
            );
            if (replacementSkuId !== undefined) data.replacementSkuId = replacementSkuId;

            const preferredVendorId = parseOptionalInteger(
              pickValue(item, 'preferredVendorId', 'preferred_vendor_id') ?? pickValue(defaults, 'preferredVendorId', 'preferred_vendor_id'),
              'preferredVendorId'
            );
            if (preferredVendorId !== undefined) data.preferredVendorId = preferredVendorId;

            const productId = parseOptionalInteger(pickValue(item, 'productId', 'product_id'), 'productId');
            if (productId !== undefined) data.productId = productId;

            const locationId = parseOptionalInteger(pickValue(item, 'locationId', 'location_id'), 'locationId');
            if (locationId !== undefined) data.locationId = locationId;

            const fieldNotes = parseOptionalString(pickValue(item, 'fieldNotes', 'field_notes'));
            if (fieldNotes !== undefined) data.fieldNotes = fieldNotes;

            const internalNotes = parseOptionalString(pickValue(item, 'internalNotes', 'internal_notes'));
            if (internalNotes !== undefined) data.internalNotes = internalNotes;

            const unitPriceEstimate = parseOptionalDecimal(
              pickValue(item, 'unitPriceEstimate', 'unit_price_estimate') ?? pickValue(defaults, 'unitPriceEstimate', 'unit_price_estimate'),
              'unitPriceEstimate'
            );
            if (unitPriceEstimate !== undefined) data.unitPriceEstimate = unitPriceEstimate;

            const inserted = (await scopedDb.insert(inventoryActionRequests).values(data).returning()) as InventoryActionRequestRow[];

            await scopedDb
              .update(issues)
              .set({
                actionRequestId: inserted[0].id,
                requiresPurchase: true,
                updatedAt: new Date(),
              })
              .where(eq(issues.id, issueId));

            createdIds.push(inserted[0].id);

            eventBus.broadcast({
              event: 'data_change:inventory_action_requests',
              data: { type: 'create', resource: 'inventory_action_requests', resourceId: inserted[0].id, data: inserted[0] },
              meta: { timestamp: Date.now(), source: 'api', audience: { customerId: scope.customerId } },
            });
          } catch (itemError: any) {
            errors.push(`Item ${idx}: ${itemError.message || 'Unknown error'}`);
            skipped++;
          }
        }

        return { created: createdIds.length, skipped, ids: createdIds, errors: errors.length > 0 ? errors : undefined };
      }
    );

    res.status(201).json({ data: result });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('inventory-action-requests bulk POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

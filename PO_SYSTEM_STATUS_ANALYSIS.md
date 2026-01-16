# PO System Status Field Analysis

**Generated:** 2025-01-XX  
**Purpose:** Comprehensive analysis of status field constraints across Database, Drizzle Schema, and Zod Validation

---

## Overview

The PO (Purchase Order) system has **THREE main status fields** that track different aspects of the procurement workflow:

1. **`procurement_status`** - Tracks the purchasing/ordering lifecycle
2. **`repair_status`** - Tracks repair-specific workflows (independent of procurement)
3. **`status`** (on Purchase Orders) - Tracks the overall PO document status

---

## 1. Procurement Status (`inventory_action_requests.procurement_status`)

### Database Constraint (PostgreSQL ENUM)
```sql
CREATE TYPE "inventory_action_procurement_status" AS ENUM(
  'pending',
  'in_review',
  'ready_for_order',
  'queued_for_po',
  'ordered',
  'fulfilled',
  'canceled'
);
```

### Drizzle Schema Definition
```typescript
export const inventoryActionProcurementStatusEnum = pgEnum(
  'inventory_action_procurement_status',
  ['pending', 'in_review', 'ready_for_order', 'queued_for_po', 'ordered', 'fulfilled', 'canceled']
);

// In inventoryActionRequests table:
procurementStatus: inventoryActionProcurementStatusEnum('procurement_status')
  .default('pending')
  .notNull(),
```

### Zod Validation Schema
```typescript
procurementStatus: z
  .enum(['pending', 'in_review', 'ready_for_order', 'queued_for_po', 'ordered', 'fulfilled', 'canceled'])
  .default('pending'),
```

### Workflow Transitions (from Documentation)

```
pending 
  ↓
in_review 
  ↓
ready_for_order 
  ↓
queued_for_po (when added to PO batch)
  ↓
ordered (when PO submitted)
  ↓
fulfilled (when items received)
  
  OR
  
canceled (at any point)
```

### Business Logic Notes
- **Default:** `'pending'` (auto-set when action request created from issue)
- **NOT NULL:** This field is required
- **Indexed:** Yes (`idx_action_requests_procurement_status`)
- **UI Gating:** The documentation states "UI should gate actions based on state"
- **Auto-timestamps:** Various timestamps are set when transitioning:
  - `queued_for_po_at` - when status → `queued_for_po`
  - `ordered_at` - when status → `ordered`
  - `fulfilled_at` - when status → `fulfilled`
  - `canceled_at` - when status → `canceled`

---

## 2. Repair Status (`inventory_action_requests.repair_status`)

### Database Constraint (PostgreSQL ENUM)
```sql
CREATE TYPE "inventory_action_repair_status" AS ENUM(
  'not_applicable',
  'pending',
  'awaiting_vendor',
  'in_service',
  'completed',
  'canceled'
);
```

### Drizzle Schema Definition
```typescript
export const inventoryActionRepairStatusEnum = pgEnum(
  'inventory_action_repair_status',
  ['not_applicable', 'pending', 'awaiting_vendor', 'in_service', 'completed', 'canceled']
);

// In inventoryActionRequests table:
repairStatus: inventoryActionRepairStatusEnum('repair_status')
  .default('not_applicable')
  .notNull(),
```

### Zod Validation Schema
```typescript
repairStatus: z
  .enum(['not_applicable', 'pending', 'awaiting_vendor', 'in_service', 'completed', 'canceled'])
  .default('not_applicable'),
```

### Workflow Transitions

```
not_applicable (for replacements/claims)

OR (for repairs):

pending
  ↓
awaiting_vendor
  ↓
in_service
  ↓
completed

  OR
  
canceled (at any point)
```

### Business Logic Notes
- **Default:** `'not_applicable'` (used when `action_type` is 'replace' or 'claim')
- **NOT NULL:** This field is required
- **Indexed:** Yes (`idx_action_requests_repair_status`)
- **Independent:** Runs parallel to procurement_status for repair workflows
- **UI Conditional:** Documentation states to "hide shipping markup, vendor, etc., when `action_type = 'repair'`"

---

## 3. Purchase Order Status (`inventory_purchase_orders.status`)

### Database Constraint (PostgreSQL ENUM)
```sql
CREATE TYPE "inventory_purchase_order_status" AS ENUM(
  'draft',
  'pending_vendor',
  'ordered',
  'receiving',
  'closed',
  'canceled'
);
```

### Drizzle Schema Definition
```typescript
export const purchaseOrderStatusEnum = pgEnum(
  'inventory_purchase_order_status',
  ['draft', 'pending_vendor', 'ordered', 'receiving', 'closed', 'canceled']
);

// In inventoryPurchaseOrders table:
status: purchaseOrderStatusEnum('status')
  .default('draft')
  .notNull(),
```

### Zod Validation Schema
```typescript
status: z
  .enum(['draft', 'pending_vendor', 'ordered', 'receiving', 'closed', 'canceled'])
  .default('draft'),
```

### Workflow Transitions

```
draft (PO being created)
  ↓
pending_vendor (submitted to vendor, awaiting acknowledgment)
  ↓
ordered (vendor confirmed)
  ↓
receiving (items arriving/being received)
  ↓
closed (all items received, PO complete)

  OR
  
canceled (at any point)
```

### Business Logic Notes
- **Default:** `'draft'`
- **NOT NULL:** This field is required
- **Indexed:** Yes (`idx_purchase_orders_status`)
- **Auto-timestamps:**
  - `submitted_at` - when status → `pending_vendor`
  - `acknowledged_at` - when status → `ordered`
  - `closed_at` - when status → `closed`

---

## 4. Shipment Status (`inventory_purchase_order_shipments.status`)

### Database Constraint (PostgreSQL ENUM)
```sql
CREATE TYPE "inventory_purchase_order_shipment_status" AS ENUM(
  'label_created',
  'in_transit',
  'delivered',
  'exception',
  'canceled'
);
```

### Drizzle Schema Definition
```typescript
export const purchaseOrderShipmentStatusEnum = pgEnum(
  'inventory_purchase_order_shipment_status',
  ['label_created', 'in_transit', 'delivered', 'exception', 'canceled']
);

// In inventoryPurchaseOrderShipments table:
status: purchaseOrderShipmentStatusEnum('status')
  .default('label_created')
  .notNull(),
```

### Zod Validation Schema
```typescript
status: z
  .enum(['label_created', 'in_transit', 'delivered', 'exception', 'canceled'])
  .default('label_created'),
```

### Workflow Transitions

```
label_created (tracking number created)
  ↓
in_transit (package picked up by carrier)
  ↓
delivered (package delivered)

  OR
  
exception (delivery issue)
  OR
canceled (shipment canceled)
```

---

## Related Enums

### Action Type (`inventory_action_requests.action_type`)

**Values:** `'replace'` | `'repair'` | `'claim'`

```typescript
// Database
CREATE TYPE "inventory_action_type" AS ENUM('replace', 'repair', 'claim');

// Drizzle
export const inventoryActionTypeEnum = pgEnum('inventory_action_type', 
  ['replace', 'repair', 'claim']
);

// Zod
actionType: z.enum(['replace', 'repair', 'claim']).default('replace'),
```

**Default:** `'replace'`  
**Business Logic:** Determines which status fields are relevant:
- `replace` → uses `procurement_status`, `repair_status = 'not_applicable'`
- `repair` → uses both `procurement_status` and `repair_status`
- `claim` → uses `procurement_status`, `repair_status = 'not_applicable'`

### Shipping Charge Type (`inventory_action_requests.shipping_charge_type`)

**Values:** `'percent'` | `'fixed'`

```typescript
// Database
CREATE TYPE "shipping_charge_type" AS ENUM('percent', 'fixed');

// Drizzle
export const shippingChargeTypeEnum = pgEnum('shipping_charge_type', 
  ['percent', 'fixed']
);

// Zod
shippingChargeType: z.enum(['percent', 'fixed']).nullable().optional(),
```

**Nullable:** Yes (optional field)

---

## Consistency Check ✅

All three layers (Database, Drizzle, Zod) are **PERFECTLY ALIGNED**:

| Status Field | DB Enum | Drizzle Enum | Zod Enum | Match |
|--------------|---------|--------------|----------|-------|
| `procurement_status` | 7 values | 7 values | 7 values | ✅ |
| `repair_status` | 6 values | 6 values | 6 values | ✅ |
| `status` (PO) | 6 values | 6 values | 6 values | ✅ |
| `status` (Shipment) | 5 values | 5 values | 5 values | ✅ |
| `action_type` | 3 values | 3 values | 3 values | ✅ |
| `shipping_charge_type` | 2 values | 2 values | 2 values | ✅ |

**No discrepancies found!** 🎉

---

## Key Indexes

The following indexes exist for efficient querying:

```sql
-- Action Requests
CREATE INDEX idx_action_requests_procurement_status ON inventory_action_requests(procurement_status);
CREATE INDEX idx_action_requests_repair_status ON inventory_action_requests(repair_status);
CREATE INDEX idx_action_requests_type ON inventory_action_requests(action_type);

-- Purchase Orders
CREATE INDEX idx_purchase_orders_status ON inventory_purchase_orders(status);

-- Shipments
CREATE INDEX idx_po_shipments_status ON inventory_purchase_order_shipments(status);
```

---

## Important Constraints

### NOT NULL Fields
All status fields are **NOT NULL** with defaults:
- `procurement_status` → `'pending'`
- `repair_status` → `'not_applicable'`
- `status` (PO) → `'draft'`
- `status` (Shipment) → `'label_created'`
- `action_type` → `'replace'`

### Foreign Key Relationships
```
inventory_action_requests
  ├─ issue_id → issues.id (CASCADE delete)
  ├─ current_purchase_order_id → inventory_purchase_orders.id (SET NULL)
  └─ preferred_vendor_id → vendors.id (SET NULL)

inventory_purchase_order_items
  ├─ purchase_order_id → inventory_purchase_orders.id (CASCADE delete)
  └─ action_request_id → inventory_action_requests.id (SET NULL)

inventory_purchase_order_shipments
  └─ purchase_order_id → inventory_purchase_orders.id (CASCADE delete)
```

---

## Developer Notes

### When Building Forms

1. **Import the Zod schema:**
   ```typescript
   import { inventoryActionRequestsValidationSchema } from '@postgress/shared';
   ```

2. **Extend for form-specific validation:**
   ```typescript
   const formSchema = inventoryActionRequestsValidationSchema.extend({
     // Add custom validations
   });
   ```

3. **Use `.partial()` for update forms:**
   ```typescript
   const updateSchema = inventoryActionRequestsValidationSchema.partial();
   ```

### Status Transition Logic

The UI should enforce valid state transitions. Example pseudo-code:

```typescript
const canTransitionTo = (currentStatus: string, newStatus: string): boolean => {
  const validTransitions = {
    'pending': ['in_review', 'canceled'],
    'in_review': ['ready_for_order', 'pending', 'canceled'],
    'ready_for_order': ['queued_for_po', 'in_review', 'canceled'],
    'queued_for_po': ['ordered', 'ready_for_order', 'canceled'],
    'ordered': ['fulfilled', 'canceled'],
    'fulfilled': [], // terminal state
    'canceled': [], // terminal state
  };
  
  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
};
```

### Conditional UI Display

From documentation:
- Hide procurement fields when `action_type = 'repair'`
- Show repair-specific fields when `action_type = 'repair'`
- Gate actions based on current status

---

## Source Files

- **Documentation:** `server/docs/procurement-ordering-guide.md`
- **Database Schema:** `full-schema.sql`
- **Drizzle Schema:** `drizzle/shared/src/schema.ts`
- **Zod Validation:** `drizzle/shared/src/zod.ts`
- **Migrations:** `drizzle/shared/migrations/0005_inventory_purchase_orders_media_assets.sql`

---

## Summary

The PO system uses a **dual-status approach**:

1. **Procurement Status** - Tracks the purchasing workflow (7 states)
2. **Repair Status** - Tracks repair workflows independently (6 states)
3. **PO Status** - Tracks the overall purchase order document (6 states)
4. **Shipment Status** - Tracks individual shipments (5 states)

All status fields are:
- ✅ Defined as PostgreSQL ENUMs at the database level
- ✅ Properly typed in Drizzle ORM schema
- ✅ Validated with Zod schemas
- ✅ Indexed for query performance
- ✅ NOT NULL with sensible defaults
- ✅ **100% consistent across all layers**

The system is well-architected with clear separation of concerns and proper constraints at every level.

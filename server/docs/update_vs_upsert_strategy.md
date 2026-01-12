# Composite Endpoint Update Strategies

This document explains how composite PUT endpoints handle child records (nested arrays like `lineItems`, `components`, `items`).

## Two Strategies

### 1. Delete + Insert (Replace All)

**How it works:**
1. Delete all existing child records
2. Insert all records from the payload

**When it's safe:**
- Child table is a "leaf" (nothing else references it via FK)
- No downstream cascade concerns

**Endpoints using this strategy:**
- `PUT /api/skus/:id/composite` → `sku_components`
- `PUT /api/products/:id/composite` → `product_components`
- `PUT /api/inventory-purchase-order-shipments/:id/composite` → `shipment_items`

### 2. Upsert (Update/Insert/Delete Orphans)

**How it works:**
1. Fetch existing child records
2. For each incoming record:
   - If `id` matches existing → **update** in place
   - If `id` missing or unknown → **insert** as new
3. Delete existing records whose `id` is **not** in the incoming payload

**When it's required:**
- Child records are referenced by other tables (FK relationships)
- Deleting records would cascade-delete important data

**Endpoints using this strategy:**
- `PUT /api/inventory-purchase-orders/:id/composite` → `lineItems`

## Why Upsert Matters for PO Line Items

The `inventory_purchase_order_items` table has a downstream dependency:

```
inventory_purchase_order_items
    ↑
    │ purchase_order_item_id (ON DELETE CASCADE)
    │
inventory_purchase_order_shipment_items
```

If we delete+insert line items, the cascade deletes all shipment items linked to them. **This is a data loss bug.**

By using upsert:
- Existing line item IDs are preserved
- Shipment items remain linked
- Only explicitly removed line items trigger cascade

## Client Requirements

### For Upsert Endpoints (PO Line Items)

**Client MUST include `id` for existing records:**

```json
{
  "inventory_purchase_order": { ... },
  "lineItems": [
    {
      "id": 123,           // ← REQUIRED for existing items
      "skuId": 266,
      "orderedQuantity": 1,
      ...
    },
    {
      // No id = new item, will be inserted
      "skuId": 267,
      "orderedQuantity": 2,
      ...
    }
  ]
}
```

**What happens:**
| Incoming `id` | Exists in DB? | Action |
|---------------|---------------|--------|
| Present | Yes | Update |
| Present | No | Insert (new record) |
| Missing | N/A | Insert (new record) |
| Existing ID not in payload | N/A | Delete |

### For Delete+Insert Endpoints (SKU/Product Components, Shipment Items)

Client can send records with or without `id` - all existing records are replaced:

```json
{
  "sku": { ... },
  "components": [
    { "componentSkuId": 264, "quantity": 1 },
    { "componentSkuId": 265, "quantity": 2 }
  ]
}
```

## Summary Table

| Endpoint | Child Table | Strategy | Client Must Send `id`? |
|----------|-------------|----------|------------------------|
| `PUT /inventory-purchase-orders/:id/composite` | `inventory_purchase_order_items` | Upsert | ✅ Yes |
| `PUT /skus/:id/composite` | `sku_components` | Delete+Insert | ❌ No |
| `PUT /products/:id/composite` | `product_components` | Delete+Insert | ❌ No |
| `PUT /inventory-purchase-order-shipments/:id/composite` | `inventory_purchase_order_shipment_items` | Delete+Insert | ❌ No |

## When to Use Which Strategy

**Use Upsert when:**
- Child records have their own identity that matters
- Other tables reference child records via FK
- Cascade deletes would cause data loss

**Use Delete+Insert when:**
- Child records are purely derived from parent
- No downstream FK references
- Simpler implementation, full replacement is acceptable

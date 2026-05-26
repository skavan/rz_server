# Components API (Bill of Materials Support)

This document describes the component (BOM - Bill of Materials) support for Products and SKUs.

## Overview

Both **Products** and **SKUs** support Bill of Materials (BOM) relationships where items can be composed of other items.

### Key Concepts

- **Simple Items**: Products/SKUs with `kind='simple'` - standalone items
- **BOM/Kit Items**: Products/SKUs with `kind='bom'` - composed of other items
- **Components**: The relationship table that defines what items make up a kit

### Tables

**Product Components** (`product_components`):
- Links products to their component products
- Fields: `parentProductId`, `componentProductId`, `quantity`, `isRequired`, `sortOrder`, `notes`
- Cascade delete: When parent product is deleted, components are auto-removed

**SKU Components** (`sku_components`):
- Links SKUs to their component SKUs  
- Fields: `parentSkuId`, `componentSkuId`, `quantity`, `isRequired`, `sortOrder`, `costAllocation`, `notes`
- Cascade delete: When parent SKU is deleted, components are auto-removed
- **Unique field**: `costAllocation` (decimal 5,4) - for cost distribution across components

## API Endpoints

### Products with Components

#### Create Product with Components
```http
POST /api/products/composite
Authorization: Bearer <token>
Content-Type: application/json

{
  "product": {
    "name": "Camera Kit",
    "homeId": 1,
    "categoryId": 5,
    "notes": "Complete camera setup",
    "kind": "bom"
  },
  "components": [
    {
      "componentProductId": 10,
      "quantity": 1,
      "isRequired": true,
      "sortOrder": 0,
      "notes": "Main camera body"
    },
    {
      "componentProductId": 11,
      "quantity": 2,
      "isRequired": true,
      "sortOrder": 1,
      "notes": "Extra batteries"
    },
    {
      "componentProductId": 12,
      "quantity": 1,
      "isRequired": false,
      "sortOrder": 2,
      "notes": "Optional lens"
    }
  ]
}
```

**Response**: `201 Created`
```json
{
  "data": {
    "id": 15,
    "name": "Camera Kit",
    "slug": "camera-kit",
    "homeId": 1,
    "categoryId": 5,
    "kind": "bom",
    "createdAt": "2025-10-19T...",
    ...
  }
}
```

#### Update Product and Components
```http
PUT /api/products/:id/composite
Authorization: Bearer <token>
Content-Type: application/json

{
  "product": {
    "name": "Updated Camera Kit",
    "notes": "New description"
  },
  "components": [
    {
      "componentProductId": 10,
      "quantity": 1,
      "isRequired": true,
      "sortOrder": 0
    }
  ]
}
```

**Note**: Components are **replaced** (delete old + insert new), not merged.

#### Delete Product (with Guards)
```http
DELETE /api/products/:id
Authorization: Bearer <token>
```

**Guards**:
1. ✅ **Cannot delete if product is used as a component** in other kits
   - Returns: `400 { "error": "Cannot delete product used in other kits", "code": "USED_IN_KITS" }`
2. ✅ **Cannot delete if product has inventory items**
   - Returns: `400 { "error": "Cannot delete product with inventory items", "code": "HAS_INVENTORY" }`
3. ✅ Cascade deletes: When delete succeeds, product_components are auto-deleted

---

### SKUs with Components

#### Create SKU with Components
```http
POST /api/skus/composite
Authorization: Bearer <token>
Content-Type: application/json

{
  "sku": {
    "name": "Sony A7IV Kit",
    "productId": 15,
    "brandId": 3,
    "vendorId": 8,
    "price": "2499.99",
    "currency": "USD",
    "kind": "bom"
  },
  "components": [
    {
      "componentSkuId": 20,
      "quantity": 1,
      "isRequired": true,
      "sortOrder": 0,
      "costAllocation": 0.80,
      "notes": "Camera body - 80% of cost"
    },
    {
      "componentSkuId": 21,
      "quantity": 2,
      "isRequired": true,
      "sortOrder": 1,
      "costAllocation": 0.15,
      "notes": "Batteries - 15% of cost"
    },
    {
      "componentSkuId": 22,
      "quantity": 1,
      "isRequired": false,
      "sortOrder": 2,
      "costAllocation": 0.05,
      "notes": "Optional accessories - 5% of cost"
    }
  ]
}
```

**Response**: `201 Created`
```json
{
  "data": {
    "id": 25,
    "name": "Sony A7IV Kit",
    "slug": "sony-a7iv-kit",
    "productId": 15,
    "brandId": 3,
    "kind": "bom",
    "price": "2499.99",
    "createdAt": "2025-10-19T...",
    ...
  }
}
```

#### Update SKU and Components
```http
PUT /api/skus/:id/composite
Authorization: Bearer <token>
Content-Type: application/json

{
  "sku": {
    "name": "Sony A7IV Complete Kit",
    "price": "2699.99"
  },
  "components": [
    {
      "componentSkuId": 20,
      "quantity": 1,
      "isRequired": true,
      "sortOrder": 0,
      "costAllocation": 0.75
    },
    {
      "componentSkuId": 21,
      "quantity": 3,
      "isRequired": true,
      "sortOrder": 1,
      "costAllocation": 0.25
    }
  ]
}
```

**Note**: Components are **replaced** (delete old + insert new), not merged.

#### Delete SKU (with Guards)
```http
DELETE /api/skus/:id
Authorization: Bearer <token>
```

**Guards**:
1. ✅ **Cannot delete if SKU is used as a component** in other kits
   - Returns: `400 { "error": "Cannot delete SKU used in other kits", "code": "USED_IN_KITS" }`
2. ✅ **Cannot delete if SKU has inventory items**
   - Returns: `400 { "error": "Cannot delete SKU with inventory items", "code": "HAS_INVENTORY" }`
3. ✅ Cascade deletes: When delete succeeds, sku_components are auto-deleted

---

## Validation Schemas (Client)

Use these Zod schemas in your forms:

```typescript
import { 
  productComponentsValidationSchema,
  skuComponentsValidationSchema 
} from '@skavan/rentalzen-drizzle/zod';

// Product component form
const productComponentSchema = productComponentsValidationSchema.extend({
  componentProductId: z.number().positive("Component required"),
});

// SKU component form
const skuComponentSchema = skuComponentsValidationSchema.extend({
  componentSkuId: z.number().positive("Component required"),
  costAllocation: z.number().min(0).max(1).optional(),
});
```

**Default Values** (automatically applied):
- `quantity`: 1
- `isRequired`: true
- `sortOrder`: 0

---

## Component Fields Reference

### Product Components
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `parentProductId` | integer | ✅ | - | The kit/parent product |
| `componentProductId` | integer | ✅ | - | The component product |
| `quantity` | integer | ✅ | 1 | How many of this component |
| `isRequired` | boolean | ✅ | true | Is this component required? |
| `sortOrder` | integer | ✅ | 0 | Display order in UI |
| `notes` | text | ❌ | null | Additional info |

### SKU Components
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `parentSkuId` | integer | ✅ | - | The kit/parent SKU |
| `componentSkuId` | integer | ✅ | - | The component SKU |
| `quantity` | integer | ✅ | 1 | How many of this component |
| `isRequired` | boolean | ✅ | true | Is this component required? |
| `sortOrder` | integer | ✅ | 0 | Display order in UI |
| `costAllocation` | decimal(5,4) | ❌ | null | Cost % (0.0000-1.0000) |
| `notes` | text | ❌ | null | Additional info |

---

## Best Practices

### 1. Cost Allocation (SKU Components Only)
When creating SKU kits, use `costAllocation` to track how the total cost is distributed:
```javascript
// Total cost: $1000
components: [
  { componentSkuId: 1, costAllocation: 0.60 },  // $600
  { componentSkuId: 2, costAllocation: 0.30 },  // $300
  { componentSkuId: 3, costAllocation: 0.10 }   // $100
]
```

### 2. Sort Order
Use `sortOrder` to control display order in UI:
- 0, 1, 2, 3... for sequential display
- Auto-assigned by array index if not provided

### 3. Optional Components
Set `isRequired: false` for optional components:
- Allows flexibility in kit configuration
- UI can show as "Optional" or allow user selection

### 4. Cascading Deletes
Be aware that deleting a parent automatically deletes all component relationships (but not the component items themselves).

### 5. Guards Before Delete
Always check the error code when deleting:
```javascript
try {
  await deleteProduct(id);
} catch (error) {
  if (error.code === 'USED_IN_KITS') {
    // Show message: "Cannot delete - used in other kits"
  } else if (error.code === 'HAS_INVENTORY') {
    // Show message: "Cannot delete - has inventory items"
  }
}
```

---

## Database Schema

### Constraints
- **Unique**: Each parent+component combination is unique (no duplicates)
- **Foreign Keys**: CASCADE DELETE on parent
- **Indexes**: On parentId, componentId, isRequired, sortOrder

### Example SQL (auto-generated by Drizzle)
```sql
CREATE TABLE product_components (
  id SERIAL PRIMARY KEY,
  parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(parent_product_id, component_product_id)
);

CREATE TABLE sku_components (
  id SERIAL PRIMARY KEY,
  parent_sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  component_sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  cost_allocation DECIMAL(5,4),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(parent_sku_id, component_sku_id)
);
```

---

## Testing Checklist

- [ ] Create simple product → Create BOM product with 3 components → Verify components saved
- [ ] Update BOM product → Replace components → Verify old removed, new added
- [ ] Try to delete product used as component → Should fail with USED_IN_KITS
- [ ] Try to delete product with inventory → Should fail with HAS_INVENTORY
- [ ] Delete BOM product → Verify components auto-deleted (cascade)
- [ ] Same tests for SKUs
- [ ] Verify costAllocation field unique to SKU components
- [ ] Test validation schemas in client forms

---

## Migration Notes

If you need to add component support to existing items:

1. **Mark as BOM**: `UPDATE products SET kind='bom' WHERE id=X;`
2. **Add components**: Use POST `/api/products/:id/composite` with empty product object and components array
3. **Verify**: Query `product_components` table or use GET `/api/products/:id`

---

**Last Updated**: October 19, 2025

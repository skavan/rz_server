# Auto-Injection Middleware Implementation

## Overview

Successfully implemented auto-injection middleware across all POST routes to automatically inject `customerId` and `homeId` from the authenticated user's session. This eliminates the need for clients to send these scoping fields and prevents security issues where clients might send unauthorized values.

## Implementation Pattern

### Before (Manual per-route)
```typescript
router.post('/', authenticateToken, async (req, res) => {
  const scope = await getRequestScope(req as any);
  // Manually handle customerId/homeId...
  const data = { customerId: scope.customerId, ...req.body };
  await db.insert(table).values(data);
});
```

### After (Middleware-based)
```typescript
router.post('/', authenticateToken, autoInjectMiddleware('tableName'), async (req, res) => {
  // req.body.customerId and/or req.body.homeId already injected!
  await db.insert(table).values(req.body);
});
```

## Updated Routes

### ✅ Products (`server/src/routes/products.ts`)
- **Requires**: `homeId`
- **Updated Endpoints**:
  - `POST /api/products` - Single product creation
  - `POST /api/products/composite` - BOM product with components
- **Pattern**: `autoInjectMiddleware('products')`

### ✅ SKUs (`server/src/routes/skus.ts`)
- **Requires**: `customerId`
- **Updated Endpoints**:
  - `POST /api/skus` - Single SKU creation
  - `POST /api/skus/composite` - BOM SKU with components
- **Pattern**: Automatic via `getRequestScope()` (SKUs are customer-scoped catalog items)
- **Note**: SKUs don't have `homeId` - they're shared across all homes within a customer

### ✅ Categories (`server/src/routes/categories.ts`)
- **Requires**: `customerId`
- **Updated Endpoints**:
  - `POST /api/categories`
- **Pattern**: `autoInjectMiddleware('categories')`

### ✅ Brands (`server/src/routes/brands.ts`)
- **Requires**: `customerId`
- **Updated Endpoints**:
  - `POST /api/brands`
- **Pattern**: `autoInjectMiddleware('brands')`

### ✅ Vendors (`server/src/routes/vendors.ts`)
- **Requires**: `customerId`
- **Updated Endpoints**:
  - `POST /api/vendors`
- **Pattern**: `autoInjectMiddleware('vendors')`

### ✅ Tags (`server/src/routes/tags.ts`)
- **Requires**: `customerId`
- **Updated Endpoints**:
  - `POST /api/tags`
- **Pattern**: `autoInjectMiddleware('tags')`

### ✅ Locations (`server/src/routes/locations.ts`)
- **Requires**: `homeId`
- **Updated Endpoints**:
  - `POST /api/locations`
- **Pattern**: `autoInjectMiddleware('locations')`
- **Removed**: Manual `homeId` validation check

### ✅ Inventory Items (`server/src/routes/inventory-items.ts`)
- **Requires**: `customerId` AND `homeId`
- **Updated Endpoints**:
  - `POST /api/inventory-items`
- **Pattern**: `autoInjectMiddleware('inventoryItems')`
- **Removed**: Manual `homeId` validation check

## Table Requirements Reference

From `server/src/utils/auto-inject.ts`:

```typescript
const TABLE_SCOPE = {
  // customerId only
  categories: { customerId: true },
  brands: { customerId: true },
  vendors: { customerId: true },
  tags: { customerId: true },
  skus: { customerId: true },

  // homeId only
  products: { homeId: true },
  locations: { homeId: true },

  // Both customerId AND homeId
  inventoryItems: { customerId: true, homeId: true },
} as const;
```

## Security Features

1. **Validation**: Middleware validates client-provided values against auth scope
2. **Auto-injection**: Missing values are automatically injected from session
3. **Rejection**: Unauthorized `customerId` or `homeId` values are rejected with 403
4. **Scope Attachment**: `req.scope` is populated for route handlers to access

## Client Impact

### Before
```typescript
// Client MUST send customerId/homeId
await fetch('/api/products', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Product',
    homeId: 123,  // Required - security risk if wrong!
  })
});
```

### After
```typescript
// Client can OMIT customerId/homeId - auto-injected from auth!
await fetch('/api/products', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Product',
    // homeId automatically injected from session
  })
});
```

**Note**: Client can still send these fields explicitly, and they will be validated against the session.

## Next Steps

1. ✅ All 7 POST routes updated with middleware
2. ⏳ Run tests to verify auto-injection works
3. ⏳ Update client forms to remove customerId/homeId fields
4. ⏳ Add integration tests for middleware validation

## Related Files

- Core Utility: `server/src/utils/auto-inject.ts`
- Middleware Factory: `server/src/utils/auto-inject-middleware.ts`
- Usage Guide: `server/src/utils/AUTO_INJECT_GUIDE.md`

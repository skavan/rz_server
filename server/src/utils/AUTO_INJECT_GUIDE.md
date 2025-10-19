# Auto-Inject Scoping Pattern

## How It Works

The `autoInjectScope()` function automatically adds `customerId` and/or `homeId` based on what each table requires, and validates any values the client provides.

## Table Requirements

| Table | Needs customerId | Needs homeId | Notes |
|-------|------------------|--------------|-------|
| **categories** | ✅ | ❌ | Customer-wide categories |
| **brands** | ✅ | ❌ | Customer-wide brands |
| **vendors** | ✅ | ❌ | Customer-wide vendors |
| **tags** | ✅ | ❌ | Customer-wide tags |
| **homes** | ✅ | ❌ | Creating a home for customer |
| **skus** | ✅ | ❌ | Customer-wide product SKUs |
| **products** | ❌ | ✅ | Home-specific products |
| **locations** | ❌ | ✅ | Home-specific locations |
| **inventoryItems** | ✅ | ✅ | BOTH required |

## Usage Examples

### Example 1: Categories (needs customerId only)

```typescript
// routes/categories.ts
import { autoInjectScope } from '../utils/auto-inject.js';

router.post('/', authenticateToken, async (req, res) => {
  const { name, slug, description, parentId } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const scope = await getRequestScope(req as any);
  
  // Auto-injects customerId from scope
  const categoryData = autoInjectScope('categories', scope, {
    name,
    slug: slug || generateSlug(name),
    description: description || null,
    parentId: parentId ? parseInt(parentId) : null,
  });
  
  const newCategories = await withTenantScope(
    { customerId: scope.customerId, homeIds: scope.homeIds },
    async (scopedDb) => {
      return scopedDb.insert(categories)
        .values({ ...categoryData, customerId: scope.customerId }) // ← customerId added
        .returning();
    }
  );
  
  res.status(201).json({ data: newCategories[0] });
});
```

**Client can send**:
```json
{
  "name": "Electronics"
}
```
Server auto-adds: `customerId: 1`

### Example 2: Products (needs homeId only)

```typescript
// routes/products.ts (ALREADY UPDATED!)
import { autoInjectScope } from '../utils/auto-inject.js';

router.post('/', authenticateToken, async (req, res) => {
  const { name, homeId, categoryId } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const scope = await getRequestScope(req as any);
  
  // Auto-injects homeId from scope if not provided
  const productData = autoInjectScope('products', scope, {
    name,
    ...(homeId !== undefined ? { homeId: parseInt(homeId) } : {}),
    categoryId: categoryId ? parseInt(categoryId) : null,
  });
  
  // productData.homeId is now guaranteed to exist!
  const slug = await generateUniqueSlug(scopedDb, name, productData.homeId!);
  
  const newProducts = await scopedDb.insert(products)
    .values({ ...productData, slug })
    .returning();
    
  res.status(201).json({ data: newProducts[0] });
});
```

**Client can send** (Option A):
```json
{
  "name": "Smart TV"
}
```
Server auto-adds: `homeId: 1` (from scope.homeIds[0])

**Client can send** (Option B):
```json
{
  "name": "Smart TV",
  "homeId": 3
}
```
Server validates: homeId 3 is in scope.homeIds, otherwise throws error

### Example 3: Inventory Items (needs BOTH)

```typescript
// routes/inventory-items.ts
import { autoInjectScope } from '../utils/auto-inject.js';

router.post('/', authenticateToken, async (req, res) => {
  const { skuId, productId, homeId, locationId, quantity } = req.body;
  
  if (!skuId || !productId) {
    return res.status(400).json({ error: 'skuId and productId required' });
  }
  
  const scope = await getRequestScope(req as any);
  
  // Auto-injects BOTH customerId AND homeId
  const itemData = autoInjectScope('inventoryItems', scope, {
    skuId: parseInt(skuId),
    productId: parseInt(productId),
    ...(homeId !== undefined ? { homeId: parseInt(homeId) } : {}),
    locationId: locationId ? parseInt(locationId) : null,
    quantity: quantity || 1,
  });
  
  const newItems = await scopedDb.insert(inventoryItems)
    .values(itemData) // ← customerId AND homeId both added!
    .returning();
    
  res.status(201).json({ data: newItems[0] });
});
```

**Client can send**:
```json
{
  "skuId": 5,
  "productId": 10
}
```
Server auto-adds: `customerId: 1, homeId: 1`

## Security Features

### 1. Auto-Injection
If client doesn't provide `customerId`/`homeId`, server adds from authenticated session.

### 2. Validation
If client DOES provide them, server validates they match the auth scope:

```typescript
// Client sends customerId: 999
autoInjectScope('categories', scope, { name: 'Test', customerId: 999 });
// ❌ Throws: "Unauthorized: customerId mismatch"

// Client sends homeId: 99
autoInjectScope('products', scope, { name: 'TV', homeId: 99 });
// ❌ Throws: "Unauthorized: homeId 99 not in allowed homes"
```

### 3. Required Fields
If table needs `homeId` but scope has no homes:

```typescript
autoInjectScope('products', { customerId: 1, homeIds: [] }, { name: 'TV' });
// ❌ Throws: "products requires homeId but none available in scope"
```

## Migration Guide

### Old Pattern (Manual):
```typescript
router.post('/', authenticateToken, async (req, res) => {
  const { name, homeId } = req.body;
  
  if (!homeId) {
    return res.status(400).json({ error: 'homeId required' });
  }
  
  const scope = await getRequestScope(req);
  
  // Manual validation
  if (!scope.homeIds.includes(parseInt(homeId))) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  await scopedDb.insert(products).values({
    name,
    homeId: parseInt(homeId),
  });
});
```

### New Pattern (Auto-Inject):
```typescript
router.post('/', authenticateToken, async (req, res) => {
  const { name, homeId } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }
  
  const scope = await getRequestScope(req);
  
  // Auto-injects homeId if missing, validates if provided
  const data = autoInjectScope('products', scope, {
    name,
    ...(homeId !== undefined ? { homeId: parseInt(homeId) } : {}),
  });
  
  await scopedDb.insert(products).values(data);
});
```

**Benefits**:
- ✅ Client doesn't need to know/send `customerId`/`homeId`
- ✅ Automatic validation if they do send it
- ✅ Type-safe (TypeScript knows which tables need what)
- ✅ Centralized security logic
- ✅ Less boilerplate in routes

## Updating Your Routes

Apply this pattern to all 5 new routes:

1. **categories.ts** - Needs `customerId` only
2. **brands.ts** - Needs `customerId` only
3. **vendors.ts** - Needs `customerId` only
4. **homes.ts** - Needs `customerId` only
5. **tags.ts** - Needs `customerId` only

Example for categories:

```typescript
// OLD (manual)
const newCategories = await scopedDb.insert(categories).values({
  customerId: scope.customerId, // ← Manual
  name,
  slug,
});

// NEW (auto-inject)
const categoryData = autoInjectScope('categories', scope, { name, slug });
const newCategories = await scopedDb.insert(categories).values(categoryData);
```

Want me to update all 5 routes now? 🚀

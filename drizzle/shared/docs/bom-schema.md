# BOM Schema Integration Guide

> Applies to: `@skavan/rentalzen-drizzle` consumers (server + declarative-client)

This guide explains how to work with Bill Of Materials (BOM) data for both Products and SKUs using the shared validation package. Follow these steps whenever you need to read, validate, or persist component relationships.

---

## 1. Shared Exports

The shared package now exposes everything you need to normalize BOM payloads:

| Export | Description |
| ------ | ----------- |
| `productComponentsValidationSchema` | Zod schema for rows in `product_components` (auto-coerces IDs, booleans, numbers, notes). |
| `skuComponentsValidationSchema` | Same as above for `sku_components`. |
| `relationArrayField(itemSchema)` | Helper that transforms form submissions (`""`, `undefined`, JSON strings, arrays) into a clean `itemSchema[]`, removing blank rows. |

These are built on the Drizzle table definitions, so column-level constraints stay in sync with the database automatically.

---

## 2. Client Form Usage

Replace any hand-rolled BOM validators with imports from `@skavan/rentalzen-drizzle`:

```ts
import {
  relationArrayField,
  skuComponentsValidationSchema,
} from '@skavan/rentalzen-drizzle';

const bomItemSchema = skuComponentsValidationSchema.pick({
  componentSkuId: true,
  quantity: true,
  isRequired: true,
  sortOrder: true,
  notes: true,
});

export const skuFormSchema = skusValidationSchema
  .extend({
    bomItems: relationArrayField(bomItemSchema),
  })
  .superRefine((data, ctx) => {
    // keep UI-only business rules: require components for kind='bom',
    // block duplicates/self-references, etc.
  });
```

Key points:
- `relationArrayField` handles `normalizeRelationArrayInput` for you. It accepts arrays, JSON strings, or empty values and always returns `[]` or `itemSchema[]`.
- The component schemas already coerce `componentSkuId`/`componentProductId`, quantities, booleans, and `notes`. No need for extra preprocessing.
- Continue layering UI-specific rules in `superRefine` (e.g., duplicates, self-reference, minimum rows).

Do the same for products using `productComponentsValidationSchema`.

---

## 3. Server Handlers

When composite endpoints (`/products/composite`, `/skus/composite`) receive payloads:

1. `relationArrayField` + the shared component schema ensures `req.body.components` is normalized before insert/update.
2. Existing transaction logic can stay, but you may remove redundant `parseInt`/`Number` coercion—the schema already guarantees correct types.
3. Validation failures bubble back as 400 responses with detailed Zod errors.

Example normalization in a route:

```ts
import {
  skuComponentsValidationSchema,
  relationArrayField,
} from '@skavan/rentalzen-drizzle';

const bomArrayValidator = relationArrayField(
  skuComponentsValidationSchema.pick({
    componentSkuId: true,
    quantity: true,
    isRequired: true,
    sortOrder: true,
    notes: true,
  })
);

const parsed = bomArrayValidator.parse(req.body.components);
```

---

## 4. FAQ

**Do we still need local helper functions?**
No. Use the shared schema + helper instead of custom `toRequiredInt`, `normalizeRelationArrayInput`, etc.

**Where do defaults come from?**
Defaults (`quantity = 1`, `isRequired = true`, `sortOrder = 0`) are defined in the shared schema, so they stay consistent across server and client.

**What about optional fields like `notes`?**
They are preprocessed to `null` when the user leaves them blank, matching the DB convention.

---

## 5. Checklist for Client Devs

1. **Import shared schemas** instead of defining local BOM Zod objects.
2. **Wrap component arrays** with `relationArrayField(...)`.
3. **Keep UI-only validation** (duplicate checks, self-reference) in `superRefine`.
4. **Remove redundant preprocessing utilities** in the client codebase.
5. **Test composite endpoints** after updating to ensure payloads still match server expectations.

Following this guide keeps BOM handling consistent, eliminates duplicated validation logic, and makes future schema changes automatic.

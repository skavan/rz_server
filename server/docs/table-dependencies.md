# Database Table Dependencies and Creation Order

## Independent Tables (No Foreign Key Dependencies)

These tables can be created first as they don't reference other tables:

1. **`customers`** - Root tenant table
   - No foreign key dependencies
   - Primary key: `id`

## Dependent Tables (Have Foreign Key Dependencies)

### Level 1 Dependencies (Depend only on independent tables)

2. **`users`** 
   - Depends on: `customers` (customer_id)
   - Primary key: `id`

3. **`homes`**
   - Depends on: `customers` (customer_id)
   - Primary key: `id`

4. **`categories`**
   - Depends on: `customers` (customer_id)
   - Self-referencing: `parent_id` (optional, references same table)
   - Primary key: `id`

5. **`brands`**
   - Depends on: `customers` (customer_id)
   - Primary key: `id`

6. **`vendors`**
   - Depends on: `customers` (customer_id)
   - Primary key: `id`

7. **`tags`**
   - Depends on: `customers` (customer_id)
   - Primary key: `id`

### Level 2 Dependencies (Depend on Level 1 tables)

8. **`user_home_access`**
   - Depends on: `users` (user_id), `homes` (home_id), `users` (granted_by)
   - Primary key: `id`

9. **`products`**
   - Depends on: `homes` (home_id), `categories` (category_id - optional)
   - Primary key: `id`

10. **`locations`**
    - Depends on: `homes` (home_id)
    - Primary key: `id`

### Level 3 Dependencies (Depend on Level 2 tables)

11. **`skus`**
    - Depends on: `customers` (customer_id), `products` (product_id), `brands` (brand_id), `vendors` (vendor_id)
    - Primary key: `id`

12. **`media_assets`**
    - Depends on: `customers` (customer_id)
    - Polymorphic references to various entities (product, sku, inventory_item, room, home)
    - Primary key: `id`

### Level 4 Dependencies (Depend on Level 3 tables)

13. **`inventory_items`**
    - Depends on: `customers` (customer_id), `homes` (home_id), `skus` (sku_id), `products` (product_id), `locations` (location_id - optional)
    - Self-referencing: `parent_item_id` (optional, for kit components)
    - Primary key: `id`

14. **`product_components`**
    - Depends on: `products` (parent_product_id), `products` (component_product_id)
    - Self-referencing relationship within products table
    - Primary key: `id`

15. **`sku_components`**
    - Depends on: `skus` (parent_sku_id), `skus` (component_sku_id)
    - Self-referencing relationship within skus table
    - Primary key: `id`

## Recommended Creation Order

```sql
-- Level 0: Independent tables
1. customers

-- Level 1: Direct dependencies on customers
2. users
3. homes
4. categories
5. brands
6. vendors
7. tags

-- Level 2: Dependencies on Level 1 tables
8. user_home_access
9. products
10. locations

-- Level 3: Dependencies on Level 2 tables
11. skus
12. media_assets

-- Level 4: Dependencies on Level 3 tables
13. inventory_items
14. product_components
15. sku_components
```

## Special Considerations

### Self-Referencing Tables
- **`categories`**: `parent_id` references same table - create table first, add parent relationships after
- **`inventory_items`**: `parent_item_id` references same table - for kit components
- **`product_components`**: both foreign keys reference `products` table
- **`sku_components`**: both foreign keys reference `skus` table

### Polymorphic References
- **`media_assets`**: Uses `entity_type` + `entity_id` pattern to reference multiple table types
  - Can reference: products, skus, inventory_items, locations, homes
  - Create this after all entity tables exist

### Array/JSONB Fields Requiring Special Indexes
These fields will need GIN indexes for optimal performance:
- `products.tags` (integer array)
- `products.check_cadence` (JSONB)
- `skus.tags` (integer array)
- `locations.tags` (integer array)
- `locations.cleaning_cadence` (JSONB)
- `locations.checking_cadence` (JSONB)
- `inventory_items.tags` (integer array)
- `media_assets.tags` (JSONB)

### Unique Constraints Spanning Multiple Columns
- Customer-scoped slugs: Most tables have unique constraints on (customer_id, slug)
- User-home access: unique on (user_id, home_id)
- Component relationships: unique on parent/component pairs

## Drop Order (Reverse of Creation)

When dropping tables, use the reverse order to avoid foreign key constraint violations:

```sql
-- Level 4 first
15. sku_components
14. product_components
13. inventory_items

-- Level 3
12. media_assets
11. skus

-- Level 2
10. locations
9. products
8. user_home_access

-- Level 1
7. tags
6. vendors
5. brands
4. categories
3. homes
2. users

-- Level 0 last
1. customers
```

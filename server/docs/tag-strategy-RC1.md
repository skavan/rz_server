# Tag Strategy - RC1

**Last Updated**: October 19, 2025  
**Status**: Active Design Document

---

## 🎯 Purpose

Tags provide flexible, user-controlled categorization and filtering across inventory management entities (SKUs, Products, Inventory Items, Locations). This document defines the tag architecture to prevent "tag storms" while maintaining simplicity and flexibility.

---

## 🏗️ Architecture Overview

### Core Principle: **Simplicity First**

Tags use a **two-dimensional filtering system**:

1. **`tagScope`** - Which table(s) can use this tag?
2. **`categoryId`** - Which category does this tag apply to? (optional)

No complex hierarchies, no over-engineering. The system is designed to be immediately understandable.

---

## 📊 Schema Design

```sql
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7),  -- Hex color code
  
  -- Two-dimensional filtering
  category_id INTEGER REFERENCES categories(id),  -- nullable, null = all categories
  tag_scope tag_scope_enum NOT NULL,               -- which table(s) can use this tag
  
  -- Future placeholder
  tag_type tag_type_enum,  -- Reserved for future use
  
  -- System/protection flags
  is_system BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(customer_id, slug)
);

-- Enums
CREATE TYPE tag_scope_enum AS ENUM (
  'product',
  'sku', 
  'inventory_item',
  'location',
  'home',
  'all'  -- applies to any table
);

CREATE TYPE tag_type_enum AS ENUM ();  -- Empty for now, reserved for future
```

---

## 🎨 Tag Filtering Logic

### Dimension 1: Tag Scope (WHERE can it be applied?)

| Scope | Applies To | Use Case |
|-------|-----------|----------|
| `'sku'` | SKUs only | Catalog-level attributes (smart-enabled, thread-count-600) |
| `'product'` | Products only | Specification metadata (rarely used) |
| `'inventory_item'` | Inventory only | Workflow states (needs-inspection, spare) |
| `'location'` | Locations only | Space characteristics (bedroom, high-humidity) |
| `'home'` | Homes only | Property characteristics (future use) |
| `'all'` | Any table | Universal tags (luxury, premium, project tags) |

### Dimension 2: Category ID (WHAT can it be applied to?)

| Value | Meaning | Example |
|-------|---------|---------|
| `NULL` | All categories | "luxury" applies to electronics, linens, furniture, etc. |
| `5` (Electronics) | Electronics only | "smart-enabled" only makes sense for electronics |
| `12` (Linens) | Linens only | "thread-count-600" only makes sense for linens |

---

## 📋 Tag Usage by Entity

### **SKUs** - Catalog Attributes

**Purpose**: Describe characteristics of purchasable catalog items

**Tag Examples**:
```javascript
// Electronics-specific (categoryId = 5)
{ name: 'Smart Enabled', scope: 'sku', categoryId: 5 }
{ name: 'WiFi Capable', scope: 'sku', categoryId: 5 }
{ name: 'Energy Star', scope: 'sku', categoryId: 5 }
{ name: 'Bluetooth', scope: 'sku', categoryId: 5 }

// Linens-specific (categoryId = 12)
{ name: 'Thread Count 600', scope: 'sku', categoryId: 12 }
{ name: 'Egyptian Cotton', scope: 'sku', categoryId: 12 }
{ name: 'Hypoallergenic', scope: 'sku', categoryId: 12 }

// Universal SKU tags (categoryId = null)
{ name: 'Luxury', scope: 'all', categoryId: null }
{ name: 'Premium', scope: 'all', categoryId: null }
{ name: 'Basic', scope: 'all', categoryId: null }
{ name: 'Commercial Grade', scope: 'all', categoryId: null }
```

**Why SKU tags?**
- Help filter catalogs when selecting SKUs for products
- Describe purchasing options and tiers
- Category-specific to prevent "smart-enabled" on bed sheets

---

### **Products** - Specifications (Minimal Use)

**Purpose**: Rarely used - most product metadata comes from SKU or structure

**Tag Examples**:
```javascript
// Project tracking
{ name: 'Kitchen Reno 2024', scope: 'all', categoryId: null }
{ name: 'Pool House Project', scope: 'all', categoryId: null }

// System grouping (maybe)
{ name: 'HVAC System', scope: 'product', categoryId: null }
{ name: 'Plumbing System', scope: 'product', categoryId: null }
```

**Design Decision**: Keep `tags` field on products table but expect it to be rarely populated. Most product characteristics are inherited from the referenced SKU or defined by the product's structure (BOM, category, etc.).

---

### **Inventory Items** - Workflow & Lifecycle

**Purpose**: Track physical item states and workflow

**Tag Examples**:
```javascript
// Workflow states (categoryId = null, applies to all)
{ name: 'Needs Inspection', scope: 'inventory_item', categoryId: null }
{ name: 'Scheduled Replacement', scope: 'inventory_item', categoryId: null }
{ name: 'Spare', scope: 'inventory_item', categoryId: null }
{ name: 'Under Warranty', scope: 'inventory_item', categoryId: null }
{ name: 'Decommissioned', scope: 'inventory_item', categoryId: null }

// Project tracking (inherited from products)
{ name: 'Kitchen Reno 2024', scope: 'all', categoryId: null }
```

**Note**: Inventory already has a `condition` field for physical state (excellent, good, fair, poor). Tags supplement this with workflow states, NOT duplicate condition.

**Inventory Structure**:
```typescript
{
  condition: 'good',  // Physical condition (field)
  tags: [15, 42],     // Workflow: needs-inspection, kitchen-reno-2024 (tags)
}
```

---

### **Locations** - Space Characteristics

**Purpose**: Describe physical spaces and their attributes

**Tag Examples**:
```javascript
// Room types
{ name: 'Bedroom', scope: 'location', categoryId: null }
{ name: 'Bathroom', scope: 'location', categoryId: null }
{ name: 'Kitchen', scope: 'location', categoryId: null }
{ name: 'Living Room', scope: 'location', categoryId: null }
{ name: 'Outdoor', scope: 'location', categoryId: null }
{ name: 'Mechanical Room', scope: 'location', categoryId: null }

// Environmental characteristics
{ name: 'High Humidity', scope: 'location', categoryId: null }
{ name: 'High Traffic', scope: 'location', categoryId: null }
{ name: 'Climate Controlled', scope: 'location', categoryId: null }
{ name: 'Pet Area', scope: 'location', categoryId: null }
```

**Why location tags?**
- Help match appropriate inventory to spaces (outdoor-rated items for outdoor locations)
- Inform maintenance schedules (high-traffic areas need more frequent service)
- Guide replacement decisions (high-humidity requires special materials)

---

## 🎯 Real-World Examples

### Example 1: Smart Thermostat

```javascript
// SKU (catalog item)
{
  name: "Nest Learning Thermostat Gen 4",
  categoryId: 5,  // Electronics
  tags: [1, 10, 11, 12]  // luxury, smart-enabled, wifi-capable, energy-star
}

// Product (specification)
{
  name: "HVAC Thermostat",
  categoryId: 8,  // HVAC category
  skuId: 123,     // references SKU above
  tags: []        // rarely used on products
}

// Inventory Item #1 (physical instance)
{
  serialNumber: "ABC123",
  productId: 456,
  locationId: 10,  // Master Bedroom
  condition: "excellent",
  tags: [25]  // under-warranty
}

// Inventory Item #2 (another instance)
{
  serialNumber: "DEF456", 
  productId: 456,
  locationId: 12,  // Guest Bedroom
  condition: "good",
  tags: [20, 21]  // needs-inspection, scheduled-replacement
}
```

**What we avoided**:
- ❌ Duplicating "smart-enabled" on every inventory item
- ❌ Tagging products with "luxury" (inherited from SKU)
- ❌ Using tags for condition (it's a field)
- ❌ Putting location info in tags (it's a relationship)

---

### Example 2: Bed Linen Set

```javascript
// SKU (catalog item)
{
  name: "Luxury Egyptian Cotton Sheet Set - King",
  categoryId: 12,  // Linens
  tags: [1, 31, 32, 33]  // luxury, thread-count-600, egyptian-cotton, hypoallergenic
}

// Product (specification)
{
  name: "King Bed Linen Set",
  categoryId: 12,  // Linens
  skuId: 789,
  tags: []  // no product-specific tags needed
}

// Inventory Item (physical instance)
{
  serialNumber: null,
  productId: 999,
  locationId: 10,  // Master Bedroom
  condition: "excellent",
  tags: [40]  // kitchen-reno-2024 (purchased during reno project)
}
```

**Why this works**:
- ✅ "thread-count-600" only shows when tagging Linens SKUs (categoryId filter)
- ✅ "luxury" applies universally (categoryId = null)
- ✅ Project tag tracks when/why it was purchased
- ✅ No tag duplication across entity types

---

## 🔒 System Tags vs User Tags

### System Tags
```javascript
{
  isSystem: true,
  locked: true,
  customerId: null  // Global, all customers can see
}
```

**Characteristics**:
- Pre-seeded by system
- Cannot be edited or deleted by users
- Provide consistent vocabulary across customers
- Examples: "luxury", "smart-enabled", "thread-count-600"

### User Tags
```javascript
{
  isSystem: false,
  locked: false,
  customerId: 123  // Customer-specific
}
```

**Characteristics**:
- Created by users on-demand
- Can be edited, deleted, deactivated
- Customer-scoped (no cross-customer pollution)
- Examples: "kitchen-reno-2024", "pool-house-phase-2"

---

## 🎨 UI/UX Guidelines

### Tag Selection Interface

When tagging an entity, the UI should filter available tags:

```typescript
// Example: Tagging a SKU with categoryId=5 (Electronics)
function getApplicableTags(entity: 'sku', entityCategoryId: 5) {
  return tags.filter(tag => 
    // Tag scope matches entity type OR is universal
    (tag.tagScope === 'sku' || tag.tagScope === 'all') &&
    
    // Tag category matches entity category OR is universal
    (tag.categoryId === entityCategoryId || tag.categoryId === null) &&
    
    // Tag is active
    tag.isActive === true
  );
}
```

**Result**: User only sees relevant tags, preventing "thread-count-600" from appearing on electronics.

### Tag Creation Workflow

**System Tag Suggestion**:
1. User starts typing tag name
2. UI suggests matching system tags first
3. User can select existing or create new

**Validation**:
```typescript
// Prevent duplicate tags with different slugs
if (existingTag = findSimilarTag(name)) {
  suggest: "Did you mean '{existingTag.name}'?"
}

// Warn about scope mismatch
if (tag.tagScope === 'sku' && entity === 'inventory_item') {
  error: "This tag can only be applied to SKUs"
}
```

---

## 🚫 Anti-Patterns to Avoid

### ❌ Don't Use Tags for Structured Data
```javascript
// BAD - use fields instead
tags: ['serial-ABC123', 'purchased-2024-01-15', 'location-bedroom']

// GOOD - use proper fields
{
  serialNumber: 'ABC123',
  purchasedAt: '2024-01-15',
  locationId: 10  // reference to locations table
}
```

### ❌ Don't Duplicate Inherent Properties
```javascript
// BAD - SKU already references categoryId
sku: {
  categoryId: 5,  // Electronics
  tags: ['electronics']  // ❌ redundant!
}

// GOOD - let relationships define structure
sku: {
  categoryId: 5,  // Electronics
  tags: ['smart-enabled', 'luxury']  // ✅ meaningful attributes
}
```

### ❌ Don't Create Tag Hierarchies
```javascript
// BAD - complex hierarchy
tags: {
  'electronics': {
    'smart-home': {
      'thermostats': ['wifi', 'voice-control']
    }
  }
}

// GOOD - flat with filtering
tags: [
  { name: 'smart-enabled', scope: 'sku', categoryId: 5 },
  { name: 'wifi-capable', scope: 'sku', categoryId: 5 }
]
// Hierarchy comes from categories table, not tags
```

---

## 📈 Future Considerations

### Reserved: `tagType` Field

Currently empty, reserved for potential future use:

**Possible future uses**:
- Grouping tags in UI (tier, feature, workflow, material)
- Color-coding tag types
- Applying business rules by type

**Decision**: Keep field as placeholder but don't over-engineer until clear use case emerges.

### Tag Analytics

Potential future features:
- Most-used tags by customer
- Tag coverage reports (% of SKUs tagged)
- Tag consistency suggestions
- Orphaned tag cleanup

### Tag Relationships

Currently tags are flat. Potential future enhancement:
- Tag aliases (thread-count-600 → tc600)
- Tag synonyms (wifi-capable ↔ wireless)
- Tag deprecation (old tag → new tag migration)

**Decision**: Don't implement until user demand is clear.

---

## 🔄 Migration Strategy

### Phase 1: Schema Changes ✅
1. Add `categoryId` column to tags table (nullable FK)
2. Keep `tagType` field empty (placeholder)
3. Ensure `tagScope` enum includes 'all'

### Phase 2: Data Reset ✅
1. Clear all existing tag arrays:
   ```sql
   UPDATE products SET tags = NULL;
   UPDATE skus SET tags = NULL;
   UPDATE locations SET tags = NULL;
   UPDATE inventory_items SET tags = NULL;
   UPDATE media_assets SET tags = NULL WHERE tags IS NOT NULL;
   ```

### Phase 3: Seed System Tags ✅
1. Seed universal tier tags (luxury, premium, basic)
2. Seed category-specific SKU tags (smart-enabled, thread-count-600, etc.)
3. Seed workflow tags for inventory
4. Seed space tags for locations

### Phase 4: API & Validation
1. Update tag routes to filter by scope + categoryId
2. Add validation preventing scope violations
3. Add tag suggestion endpoint
4. Update documentation

### Phase 5: UI Integration
1. Scope-filtered tag dropdowns
2. Tag creation with scope/category selection
3. Tag management interface
4. Tag analytics dashboard (future)

---

## 📚 Implementation Checklist

- [ ] Add `categoryId` column to tags table
- [ ] Empty `tagType` enum (keep field)
- [ ] Clear existing tag data from all tables
- [ ] Create seed data script with system tags
- [ ] Update Zod validation schemas
- [ ] Build shared package
- [ ] Create tags routes (CRUD + filtering)
- [ ] Add tag filtering logic (scope + category)
- [ ] Add tag validation guards
- [ ] Update documentation
- [ ] Test tag filtering with different scopes/categories
- [ ] UI: Tag selection dropdown with filtering
- [ ] UI: Tag creation interface
- [ ] UI: Tag management page

---

## 🎓 Key Takeaways

1. **Two dimensions**: `tagScope` (where) + `categoryId` (what)
2. **Null = all**: Both fields use null for universal application
3. **Simplicity wins**: No hierarchies, no over-engineering
4. **System + user**: Pre-seeded vocabulary + user flexibility
5. **Inheritance**: SKU → Product → Inventory (don't duplicate)
6. **Fields not tags**: Use proper fields for structured data
7. **Future-proof**: `tagType` placeholder for potential expansion

---

**Questions or clarifications?** See operational-playbook-RC1.md for implementation details.

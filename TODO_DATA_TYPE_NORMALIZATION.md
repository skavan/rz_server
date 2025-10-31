# TODO: Data Type Normalization & Date Handling

## Server Team Handoff (2025-10-29)

**Requested Change:** Update `@postgress/shared` so all Drizzle-derived schemas accept string/number inputs for timestamp fields without client-side overrides.

- **Scope:** Adjust `drizzle/shared/src/zod.ts` by passing the relevant field names into the existing `refineDateFields(...)` helper for every table that has date/timestamp columns (`locations`, `inventoryItems`, `products`, `skus`, `categories`, `homes`, `customers`, `vendors`, `brands`, `tags`, `reservations`, BOM tables).
- **Goal:** The generated schemas should coerce ISO strings (or numbers) to `Date | null`, eliminating the need for clients to `.extend()` each schema with `toNullableDate` logic.
- **Validation:** Run the shared package test suite (`pnpm test` in the shared repo) and publish a new build so the client can bump `@postgress/shared`.
- **Contact:** Declarative client team will validate once the update lands and remove local overrides.

## Problem Statement

We have **three layers with type mismatches** for dates and timestamps:

```
DB Layer (Drizzle)  →  API Layer (JSON)  →  Form Layer (UI)
Date objects       →  ISO strings       →  Various formats
```

**Current pain:**
- Every form must manually `.extend()` Drizzle schemas to handle string dates
- Date pickers return locale strings (`"10/17/2025"`) requiring Zod transforms
- Inconsistent - some fields use `dateFieldValidator`, others use manual transforms

## Solution 1: Fix Drizzle Schema Generation (P0)

**Goal:** Drizzle schemas should accept **string OR Date** for timestamp fields

**File:** `drizzle/shared/zod.ts`

**Current:**
```typescript
export const locationValidationSchema = createValidationSchema(locations);
// Expects Date objects for timestamp fields
```

**Proposed:**
```typescript
export const locationValidationSchema = createValidationSchema(locations, {
  // Override timestamp fields to accept string or Date
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  lastCleaned: dateFieldValidator,
  lastChecked: dateFieldValidator,
});
```

**Apply to ALL tables with timestamp fields:**
- [ ] locations
- [ ] inventory_items  
- [ ] products
- [ ] skus
- [ ] categories
- [ ] homes
- [ ] customers
- [ ] vendors
- [ ] brands
- [ ] tags

**Benefit:** Forms just use `locationValidationSchema` directly, no `.extend()` needed

---

## Solution 2: Smart Date Picker with Output Format (P1)

**Goal:** Date picker declares what format it returns, with intelligent default

**File:** `packages/declarative-framework/src/components/forms/fields/date.tsx`

**Proposed rendererOptions:**
```typescript
{
  outputFormat?: 'iso' | 'date' | 'locale' | 'unix';
  // iso: "2025-10-17T00:00:00.000Z" (default, most API-friendly)
  // date: Date object
  // locale: "10/17/2025" (current behavior)
  // unix: 1729123200000 (timestamp)
}
```

**Implementation:**
```typescript
function DateField({ name, label, rendererOptions }) {
  const { control } = useFormContext();
  const outputFormat = rendererOptions?.outputFormat ?? 'iso';
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Input
          type="date"
          value={field.value ? formatDateForInput(field.value) : ''}
          onChange={(e) => {
            const date = new Date(e.target.value);
            let output;
            
            switch (outputFormat) {
              case 'iso':
                output = date.toISOString();
                break;
              case 'date':
                output = date;
                break;
              case 'unix':
                output = date.getTime();
                break;
              case 'locale':
              default:
                output = e.target.value; // Keep as-is
            }
            
            field.onChange(output);
          }}
        />
      )}
    />
  );
}
```

**Default to 'iso'** because:
- Most APIs expect ISO strings
- Eliminates need for Zod transforms
- Consistent across all date fields
- Easy to parse/compare

**Layout usage:**
```typescript
// Default (iso) - no config needed
{ id: 'lastCleaned', renderer: 'date' }

// Override if needed
{ 
  id: 'lastCleaned', 
  renderer: 'date',
  rendererOptions: { outputFormat: 'locale' } // For special cases
}
```

**Benefit:** 
- ✅ Forms get ISO strings by default
- ✅ No Zod transforms needed
- ✅ Still flexible for special cases
- ✅ Declarative control via layout

---

## Solution 3: Bidirectional Date Handling (P2)

**Problem:** Date picker needs to **parse input** when editing existing records

**Enhancement:**
```typescript
rendererOptions: {
  outputFormat: 'iso',      // What to return to form
  inputFormat: 'auto',      // How to parse incoming value
  // auto: Try ISO, then locale, then Date object
  // iso: Parse as ISO string
  // locale: Parse as locale string
  // date: Expect Date object
}
```

**Implementation:**
```typescript
const parseIncomingValue = (value: any, inputFormat: string) => {
  if (!value) return '';
  
  if (inputFormat === 'auto') {
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      // Try ISO first
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return new Date(value);
      }
      // Try parse
      return new Date(value);
    }
  }
  
  // Handle specific formats...
  return new Date(value);
};
```

---

## Migration Strategy

### Phase 1: Fix Drizzle Schemas (Quick Win)
1. Update `drizzle/shared/zod.ts` with coerced date schemas
2. Remove all `.extend()` calls from form definitions
3. Test all forms with existing data

### Phase 2: Smart Date Picker (Better DX)
1. Update date field renderer with `outputFormat`
2. Default to 'iso'
3. Update documentation

### Phase 3: Polish (Nice to Have)
1. Add `inputFormat: 'auto'` for parsing
2. Add timezone handling options
3. Add date range pickers with same pattern

---

## Testing Checklist

- [ ] Create new location with dates → saves as ISO
- [ ] Edit existing location → dates load correctly
- [ ] Date validation errors show properly
- [ ] Empty/null dates handled correctly
- [ ] Timezone edge cases (UTC vs local)
- [ ] Different browsers (Safari date picker quirks)

---

## Files to Update

### Drizzle Schemas (P0)
- `drizzle/shared/zod.ts` - Fix all table schemas

### Date Renderer (P1)
- `packages/declarative-framework/src/components/forms/fields/date.tsx`

### Form Definitions (Cleanup after P0)
- `apps/rentalzen/lib/declarative-engine/dev-builders/definitions/locations-form.definition.ts`
- `apps/rentalzen/lib/declarative-engine/dev-builders/definitions/inventory-items-form.definition.ts`
- `apps/rentalzen/lib/declarative-engine/dev-builders/definitions/products-form.definition.ts`
- Any other forms using `.extend()` for date fields

### Documentation
- Add `outputFormat` to renderer options docs
- Document Drizzle schema approach

---

## Effort Estimate
- P0 (Drizzle schemas): 2-3 hours (update all tables + test)
- P1 (Date picker): 2-4 hours (implement + test edge cases)
- P2 (Bidirectional): 1-2 hours (parsing logic)

**Total:** ~1 day of focused work for complete solution

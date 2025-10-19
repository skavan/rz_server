import { z } from "zod";
import { createInsertSchema as createValidationSchema } from "drizzle-zod";
import { locations, inventoryItems, products, skus, categories, brands, vendors, homes, tags } from "./schema.js";
import { cadenceConfigSchema } from "./types/json-fields.js";

/**
 * ==============================================================================
 * BASE VALIDATION SCHEMAS - Auto-generated from Drizzle Table Definitions
 * ==============================================================================
 * 
 * These schemas are the single source of truth for validation, automatically
 * derived from Drizzle ORM table definitions. They ensure runtime validation
 * matches database schema constraints.
 * 
 * USAGE IN CLIENT FORMS:
 * ----------------------
 * 1. Import the base schema: 
 *    import { inventoryItemValidationSchema } from '@postgress/shared';
 * 
 * 2. Extend with form-specific validations:
 *    export const inventoryItemFormSchema = inventoryItemValidationSchema.extend({
 *      skuId: z.number().int().positive("SKU is required"),
 *      quantity: z.number().min(0, "Quantity cannot be negative")
 *    });
 * 
 * 3. Use .partial() for update forms (all fields optional):
 *    export const updateInventoryItemSchema = inventoryItemValidationSchema.partial();
 * 
 * 4. Use .pick() for subset forms:
 *    export const quickAddSchema = inventoryItemValidationSchema.pick({
 *      skuId: true,
 *      locationId: true,
 *      quantity: true
 *    });
 * 
 * INSPECTING SCHEMAS:
 * ------------------
 * To see the exact structure of any schema, use the generate-schema-code.ts tool:
 *   npx tsx generate-schema-code.ts inventoryItems
 * 
 * This outputs the complete z.object({...}) definition with all fields and types,
 * so you know exactly what to extend, override, or refine.
 * 
 * KEEPING SCHEMAS IN SYNC:
 * ------------------------
 * 1. Update schema in: rz_server/drizzle/shared/src/schema.ts
 * 2. Build shared package: npm run build (in shared directory)
 * 3. Update client: pnpm install --force (in client directory)
 * 4. Generate new schema code: npx tsx generate-schema-code.ts [tableName]
 */

/**
 * Locations validation schema - matches table name 'locations'
 * Pre-configured with sensible defaults: isActive=true
 */
export const locationsValidationSchema = createValidationSchema(locations).extend({
  isActive: z.boolean().default(true),
});

/**
 * Inventory Items validation schema - matches table name 'inventory_items'
 * Defaults: isActive=true, hasMediaAssets=false, isKitComponent=false, quantity=1, 
 *           status='unassigned', condition='good', currency='USD'
 */
export const inventoryItemsValidationSchema = createValidationSchema(inventoryItems).extend({
  isActive: z.boolean().default(true),
  hasMediaAssets: z.boolean().default(false),
  isKitComponent: z.boolean().default(false),
  quantity: z.number().default(1),
  status: z.enum(['unassigned', 'assigned', 'in_use', 'in_storage', 'needs_repair', 'retired']).default('unassigned'),
  condition: z.enum(['new', 'excellent', 'good', 'fair', 'poor', 'broken']).default('good'),
  currency: z.string().default('USD'),
});

/**
 * Products validation schema - matches table name 'products'
 * Defaults: isVisible=true, isActive=true, hasMediaAssets=false, kind='simple'
 */
export const productsValidationSchema = createValidationSchema(products).extend({
  isVisible: z.boolean().default(true),
  isActive: z.boolean().default(true),
  hasMediaAssets: z.boolean().default(false),
  kind: z.enum(['simple', 'bom']).default('simple'),
});

/**
 * SKUs validation schema - matches table name 'skus'
 * Defaults: hasMediaAssets=false, kind='simple', status='active'
 */
export const skusValidationSchema = createValidationSchema(skus).extend({
  hasMediaAssets: z.boolean().default(false),
  kind: z.enum(['simple', 'bom']).default('simple'),
  status: z.enum(['active', 'discontinued', 'unknown']).default('active'),
});

/**
 * Categories validation schema - matches table name 'categories'
 * Defaults: isActive=true
 */
export const categoriesValidationSchema = createValidationSchema(categories).extend({
  isActive: z.boolean().default(true),
});

/**
 * Brands validation schema - matches table name 'brands'
 * Defaults: isActive=true
 */
export const brandsValidationSchema = createValidationSchema(brands).extend({
  isActive: z.boolean().default(true),
});

/**
 * Vendors validation schema - matches table name 'vendors'
 * Defaults: isActive=true
 */
export const vendorsValidationSchema = createValidationSchema(vendors).extend({
  isActive: z.boolean().default(true),
});

/**
 * Homes validation schema - matches table name 'homes'
 * Defaults: isActive=true
 */
export const homesValidationSchema = createValidationSchema(homes).extend({
  isActive: z.boolean().default(true),
});

/**
 * Tags validation schema - matches table name 'tags'
 * Defaults: isActive=true, isSystem=false, locked=false
 */
export const tagsValidationSchema = createValidationSchema(tags).extend({
  isActive: z.boolean().default(true),
  isSystem: z.boolean().default(false),
  locked: z.boolean().default(false),
});

// Common Field Validators - reusable across forms

/**
 * Date field validator - handles date inputs from forms
 * Converts empty strings/null to null, parses various date formats
 */
export const dateFieldValidator = z.preprocess((v) => {
  if (v === "" || v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yy, mm, dd] = m;
      return new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd)));
    }
    return new Date(v);
  }
  return undefined;
}, z.date().nullable().optional());

/**
 * Cadence JSON field validator - for cleaning/checking schedules
 * Handles empty string to null conversion before validating cadence structure
 */
export const cadenceJsonFieldValidator = z.preprocess(
  (v) => (v === '' ? null : v),
  cadenceConfigSchema
);

/**
 * Tag IDs validator - handles array of tag IDs from form inputs
 * Converts string numbers to integers, handles optional arrays
 */
export const tagIdsValidator = z
  .array(
    z.union([
      z.number().int(),
      z.string().regex(/^\d+$/).transform(s => Number(s))
    ])
  )
  .optional()
  .transform(arr => 
    Array.isArray(arr) 
      ? arr.map(v => typeof v === "string" ? Number(v) : v) 
      : undefined
  );

/**
 * Parent ID validator - handles optional parent relationships
 * Converts empty strings to undefined, validates positive integers
 */
export const parentIdValidator = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)), 
  z.number().int().positive().optional()
);

/**
 * Slug generator function - creates URL-friendly slugs from text
 * Standard format: lowercase, spaces/special chars become dashes, no double dashes
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and dashes
    .replace(/\s+/g, '-')     // Replace spaces with dashes
    .replace(/-+/g, '-')      // Replace multiple dashes with single dash
    .replace(/^-|-$/g, '');   // Remove leading/trailing dashes
}

/**
 * Auto-slug validator - generates slug from name field
 * Use this in forms where slug should be auto-generated from name
 */
export const autoSlugValidator = z.string().transform((name, ctx) => {
  if (!name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Name is required to generate slug",
    });
    return z.NEVER;
  }
  return generateSlug(name);
});

/**
 * Timestamp validator - handles createdAt/updatedAt from database
 * Converts string timestamps to Date objects, leaves Date objects as-is
 */
export const timestampValidator = z.preprocess((v) => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const date = new Date(v);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}, z.date().nullable().optional());

// UI forms should apply any page-specific rules locally via .extend()

import { z } from "zod";
import { createInsertSchema as createValidationSchema } from "drizzle-zod";
import { locations, inventoryItems, products, skus, categories, brands, vendors, homes, tags, customers, productComponents, skuComponents, reservations } from "./schema.js";
import { cadenceConfigSchema } from "./types/json-fields.js";
import { slugSchema, slugInputSchema } from "./utils/slug.js";

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
 * Shared helpers for coercing date-like fields.
 * Ensures form inputs can send strings/numbers while downstream code receives Date/null.
 */
const coerceDateInput = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === "" || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
};

const withDatePreprocess = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess(coerceDateInput, schema);

const refineDateFields = <T extends string>(...fields: T[]) =>
  fields.reduce<Record<T, (schemaMap: Record<string, z.ZodTypeAny>) => z.ZodTypeAny>>(
    (acc, field) => {
      acc[field] = (schemaMap) => withDatePreprocess(schemaMap[field]);
      return acc;
    },
    {} as Record<T, (schemaMap: Record<string, z.ZodTypeAny>) => z.ZodTypeAny>
  );

const isBlankValue = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isBlankValue);
  if (typeof value === "object") {
    return Object.values(value).every(isBlankValue);
  }
  return false;
};

const toRequiredInt = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return value;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const toOptionalInt = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const toNullableString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return String(value);
};

const parseJsonMaybe = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toOptionalBoolean = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "") return undefined;
    if (["true", "1", "yes", "on"].includes(trimmed)) return true;
    if (["false", "0", "no", "off"].includes(trimmed)) return false;
  }
  return value;
};

/**
 * Normalizes relation arrays from form submissions or JSON payloads.
 * - Accepts strings (JSON), arrays, or undefined
 * - Filters out blank rows (all fields empty)
 * - Defaults to [] when no data provided
 */
export const relationArrayField = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.preprocess((value) => {
    if (value == null || value === "") return [];

    const normalizeItem = (item: unknown) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (!trimmed) return undefined;
        return parseJsonMaybe(trimmed);
      }
      if (typeof item === "object" && item !== null) {
        return item;
      }
      return item;
    };

    const toArray = () => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        const parsed = parseJsonMaybe(value.trim());
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      return [value];
    };

    const cleaned = toArray()
      .map(normalizeItem)
      .filter((item) => !(item === undefined || isBlankValue(item)));

    return cleaned;
  }, z.array(itemSchema).optional().default([]));

/**
 * Locations validation schema - matches table name 'locations'
 * Pre-configured with sensible defaults: isActive=true
 */
export const locationsValidationSchema = createValidationSchema(
  locations,
  refineDateFields('lastCleaned', 'lastChecked', 'createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isActive: z.boolean().default(true),
});

/**
 * Inventory Items validation schema - matches table name 'inventory_items'
 * Defaults: isActive=true, hasMediaAssets=false, isKitComponent=false, quantity=1, 
 *           status='unassigned', condition='good', currency='USD'
 */
export const inventoryItemsValidationSchema = createValidationSchema(
  inventoryItems,
  refineDateFields(
    'lastChecked',
    'lastMaintained',
    'purchaseDate',
    'warrantyExpires',
    'expectedReplacement',
    'createdAt',
    'updatedAt'
  )
).extend({
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
export const productsValidationSchema = createValidationSchema(
  products,
  refineDateFields('createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isVisible: z.boolean().default(true),
  isActive: z.boolean().default(true),
  hasMediaAssets: z.boolean().default(false),
  kind: z.enum(['simple', 'bom']).default('simple'),
});

/**
 * SKUs validation schema - matches table name 'skus'
 * Defaults: hasMediaAssets=false, kind='simple', status='active'
 */
export const skusValidationSchema = createValidationSchema(
  skus,
  refineDateFields('priceUpdated', 'createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  hasMediaAssets: z.boolean().default(false),
  kind: z.enum(['simple', 'bom']).default('simple'),
  status: z.enum(['active', 'discontinued', 'unknown']).default('active'),
});

/**
 * Categories validation schema - matches table name 'categories'
 * Defaults: isActive=true
 */
export const categoriesValidationSchema = createValidationSchema(
  categories,
  refineDateFields('createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isActive: z.boolean().default(true),
});

/**
 * Customers validation schema - matches table name 'customers'
 * Defaults: subscriptionStatus='active', maxHomes=5, onboardingCompleted=false
 */
export const customersValidationSchema = createValidationSchema(
  customers,
  refineDateFields('trialEndsAt', 'subscriptionStartsAt', 'lastPaymentDate', 'createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  subscriptionStatus: z.enum(['active', 'pending', 'cancelled', 'suspended']).default('active'),
  maxHomes: z.number().int().default(5),
  onboardingCompleted: z.boolean().default(false),
});

/**
 * Brands validation schema - matches table name 'brands'
 * Defaults: isActive=true
 */
export const brandsValidationSchema = createValidationSchema(
  brands,
  refineDateFields('createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isActive: z.boolean().default(true),
});

/**
 * Vendors validation schema - matches table name 'vendors'
 * Defaults: isActive=true
 */
export const vendorsValidationSchema = createValidationSchema(
  vendors,
  refineDateFields('createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isActive: z.boolean().default(true),
});

/**
 * Homes validation schema - matches table name 'homes'
 * Defaults: isActive=true
 */
export const homesValidationSchema = createValidationSchema(
  homes,
  refineDateFields('createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isActive: z.boolean().default(true),
});

/**
 * Tags validation schema - matches table name 'tags'
 * Defaults: isActive=true, isSystem=false, locked=false
 * categoryId is nullable - null means tag applies to all categories within scope
 * tagScope determines which tables can use this tag
 */
export const tagsValidationSchema = createValidationSchema(
  tags,
  refineDateFields('createdAt', 'updatedAt')
).extend({
  slug: slugInputSchema,
  isActive: z.boolean().default(true),
  isSystem: z.boolean().default(false),
  locked: z.boolean().default(false),
});

/**
 * Product Components validation schema (Bill of Materials)
 * Defines which products are components of other products
 * Defaults: quantity=1, isRequired=true, sortOrder=0
 */
export const productComponentsValidationSchema = createValidationSchema(
  productComponents,
  refineDateFields('createdAt')
).extend({
  parentProductId: z.preprocess(toRequiredInt, z.number().int().positive()),
  componentProductId: z.preprocess(toRequiredInt, z.number().int().positive()),
  notes: z.preprocess(toNullableString, z.string().nullable().optional()),
  quantity: z.preprocess(toOptionalInt, z.number().int().positive().default(1)),
  isRequired: z.preprocess(toOptionalBoolean, z.boolean().optional().default(true)),
  sortOrder: z.preprocess(toOptionalInt, z.number().int().optional().default(0)),
});

/**
 * SKU Components validation schema (Bill of Materials)
 * Defines which SKUs are components of other SKUs
 * Defaults: quantity=1, isRequired=true, sortOrder=0
 */
export const skuComponentsValidationSchema = createValidationSchema(
  skuComponents,
  refineDateFields('createdAt')
).extend({
  parentSkuId: z.preprocess(toRequiredInt, z.number().int().positive()),
  componentSkuId: z.preprocess(toRequiredInt, z.number().int().positive()),
  notes: z.preprocess(toNullableString, z.string().nullable().optional()),
  quantity: z.preprocess(toOptionalInt, z.number().int().positive().default(1)),
  isRequired: z.preprocess(toOptionalBoolean, z.boolean().optional().default(true)),
  sortOrder: z.preprocess(toOptionalInt, z.number().int().optional().default(0)),
});

/**
 * Reservations validation schema - matches table name 'reservations'
 * Property booking/reservation data from external booking systems
 * Defaults: isActive=true, ownerBook=0, currency='USD'
 */
export const reservationsValidationSchema = createValidationSchema(
  reservations,
  refineDateFields(
    'checkin',
    'checkout',
    'createdDate',
    'updatedDate',
    'cancellationDate',
    'createdAt',
    'updatedAt'
  )
).extend({
  isActive: z.boolean().default(true),
  ownerBook: z.number().int().default(0),
  currency: z.string().default('USD'),
});

// Common Field Validators - reusable across forms

/**
 * Date field validator - handles date inputs from forms
 * Converts empty strings/null to null, parses various date formats
 */
export const dateFieldValidator = z.preprocess((value) => {
  if (value === undefined) {
    return null;
  }
  return coerceDateInput(value);
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
 * Timestamp validator - handles createdAt/updatedAt from database
 * Converts string timestamps to Date objects, leaves Date objects as-is
 */
export const timestampValidator = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  if (value instanceof Date) return value;
  const coerced = coerceDateInput(value);
  return coerced ?? null;
}, z.date().nullable().optional());

// UI forms should apply any page-specific rules locally via .extend()

export { autoSlugValidator, generateSlug, normalizeSlug, slugSchema } from "./utils/slug.js";

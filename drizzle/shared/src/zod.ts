import { z } from "zod";
import { createInsertSchema as createValidationSchema } from "drizzle-zod";
import { locations, inventoryItems, products, skus } from "./schema";
import { cadenceConfigSchema } from "./types/json-fields.js";

// Base Zod validation schemas derived from Drizzle table definitions
export const locationValidationSchema = createValidationSchema(locations);
export const inventoryItemValidationSchema = createValidationSchema(inventoryItems);
export const productValidationSchema = createValidationSchema(products);
export const skuValidationSchema = createValidationSchema(skus);

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

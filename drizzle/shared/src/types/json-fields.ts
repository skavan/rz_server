/**
 * JSON Field Types & Schemas
 * 
 * Centralized definition of complex JSON field structures used in the database
 */

import { z } from "zod";

// Cleaning/Checking Cadence structure (used in locations table)
export type CadenceConfig = {
  targetDays?: number;
  maxDays?: number;
};

export const cadenceConfigSchema = z
  .object({ 
    targetDays: z.number().int().positive().optional(), 
    maxDays: z.number().int().positive().optional() 
  })
  .partial()
  .refine((obj) => obj.targetDays != null || obj.maxDays != null, { 
    message: 'Set at least one value or disable' 
  })
  .nullable()
  .optional();

// Preprocessing for form handling (empty string to null)
export const cadencePreprocessor = z.preprocess(
  (v) => (v === '' ? null : v),
  cadenceConfigSchema
);

/**
 * Comments now store HTML strings (TipTap output) instead of structured block JSON.
 * Legacy block helpers remain exported for compatibility but resolve to `never`.
 */
export type CommentBodyBlock = never;

export type CommentBody = string;

export const commentBodyBlockSchema = z.never({
  message: 'Comment blocks are no longer supported; send an HTML string instead.',
});

export const commentBodySchema = z.string().min(1).max(40000);

// Future: Add other JSON field types as needed
// export type MediaConfig = { ... };
// export type TagConfig = { ... };

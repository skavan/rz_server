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

const hasContent = (value?: string | null) => typeof value === 'string' && value.trim().length > 0;

const hasData = (value?: Record<string, unknown> | null) => Boolean(value && Object.keys(value).length);

const commentBlockTypes = [
  'paragraph',
  'heading',
  'blockquote',
  'ordered_list',
  'bullet_list',
  'code',
  'system',
  'action',
] as const;

export type CommentBodyBlock = {
  type: (typeof commentBlockTypes)[number];
  text?: string;
  html?: string;
  data?: Record<string, unknown>;
};

export type CommentBody = {
  version?: number;
  blocks: CommentBodyBlock[];
};

export const commentBodyBlockSchema = z
  .object({
    type: z.enum(commentBlockTypes),
    text: z.string().max(20000).optional(),
    html: z.string().max(40000).optional(),
    data: z.record(z.any()).optional(),
  })
  .refine((block) => hasContent(block.text) || hasContent(block.html) || hasData(block.data), {
    message: 'Block must include text, html, or data payload',
  });

export const commentBodySchema = z.object({
  version: z.number().int().positive().default(1),
  blocks: z.array(commentBodyBlockSchema).min(1, 'Provide at least one content block'),
});

// Future: Add other JSON field types as needed
// export type MediaConfig = { ... };
// export type TagConfig = { ... };

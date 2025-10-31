import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(100, 'Slug must be at most 100 characters')
  .regex(SLUG_REGEX, 'Slug may only contain lowercase letters, numbers, and single dashes');

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
      .replace(/[^\x00-\x7F]+/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeSlug(input: string): string {
  const slug = generateSlug(input);
  if (!slugSchema.safeParse(slug).success) {
    throw new Error('Invalid slug format');
  }
  return slug;
}

export const autoSlugValidator = z
  .string()
  .transform((value, ctx) => {
    const text = value?.trim();
    if (!text) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name is required to generate slug' });
      return z.NEVER;
    }
    return generateSlug(text);
  });

export const slugInputSchema = z
  .union([z.string(), z.undefined()])
  .transform((value) => (typeof value === 'string' ? normalizeSlug(value) : value));

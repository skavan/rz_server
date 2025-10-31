import { normalizeSlug } from '@postgress/shared';

export class SlugValidationError extends Error {
  status = 400;
}

export function resolveSlug(rawSlug: unknown, fallback?: string): string {
  const slugCandidate = typeof rawSlug === 'string' && rawSlug.trim().length > 0
    ? rawSlug
    : (fallback && fallback.trim().length > 0 ? fallback : '');

  if (!slugCandidate) {
    throw new SlugValidationError('Name is required to generate slug');
  }

  try {
    return normalizeSlug(slugCandidate);
  } catch {
    throw new SlugValidationError('Invalid slug format');
  }
}

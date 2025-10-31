import type { RequestScope } from '../../utils/scope.js';

export class ValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function normalizeDateInput(raw: string): string {
  let normalized = raw.replace(' ', 'T');
  normalized = normalized.replace(/\.([0-9]{3})[0-9]+/, '.$1');
  normalized = normalized.replace(/([+-]\d{2})(\d{2})?$/, (_match, hours: string, minutes?: string) => {
    const minutePortion = minutes ?? '00';
    return `${hours}:${minutePortion}`;
  });
  return normalized;
}

export function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value);
  return isBlank(text) ? null : text.trim();
}

export function requireString(value: unknown, field: string): string {
  const parsed = parseOptionalString(value);
  if (!parsed) {
    throw new ValidationError(`${field} is required`);
  }
  return parsed;
}

export function parseOptionalInteger(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new ValidationError(`${field} must be a number`);
  }
  return Math.trunc(num);
}

export function requireNumber(value: unknown, field: string): number {
  const parsed = parseOptionalInteger(value, field);
  if (parsed == null) {
    throw new ValidationError(`${field} is required`);
  }
  return parsed;
}

export function parseOptionalDecimal(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError(`${field} must be numeric`);
    }
    return value.toString();
  }
  const text = String(value).trim();
  if (!text) return null;
  if (Number.isNaN(Number(text))) {
    throw new ValidationError(`${field} must be numeric`);
  }
  return text;
}

export function requireDecimal(value: unknown, field: string): string {
  const parsed = parseOptionalDecimal(value, field);
  if (parsed == null) {
    throw new ValidationError(`${field} is required`);
  }
  return parsed;
}

export function parseOptionalBoolean(value: unknown, field: string): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new ValidationError(`${field} must be a boolean`);
}

export function parseOptionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      throw new ValidationError(`${field} must be a valid date`);
    }
    return value;
  }
  const raw = String(value).trim();
  if (!raw) return null;

  let normalized = normalizeDateInput(raw);
  let parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf()) && !/[+-]\d{2}:\d{2}$/.test(normalized) && !normalized.endsWith('Z')) {
    parsed = new Date(`${normalized}Z`);
  }
  if (Number.isNaN(parsed.valueOf())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  return parsed;
}

export function requireDate(value: unknown, field: string): Date {
  const parsed = parseOptionalDate(value, field);
  if (!parsed) {
    throw new ValidationError(`${field} is required`);
  }
  return parsed;
}

export function parseOptionalJson(value: unknown, field: string): any {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ValidationError(`${field} must be valid JSON`);
    }
  }
  if (typeof value === 'object') {
    return value;
  }
  throw new ValidationError(`${field} must be JSON serializable`);
}

export function parseStringArray(value: unknown, field: string): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new ValidationError(`${field} must be an array`);
        }
        return parsed
          .map((item: any) => String(item).trim())
          .filter((item: string) => item.length > 0);
      } catch {
        throw new ValidationError(`${field} must be a JSON array or comma-separated string`);
      }
    }
    return text
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  throw new ValidationError(`${field} must be an array of strings`);
}

export function ensureHomeAccess(scope: RequestScope, homeId: number): void {
  if (!scope.homeIds.includes(homeId)) {
    throw new ValidationError(`homeId ${homeId} is not accessible in current scope`, 403);
  }
}

export function parsePagination(
  limitValue: unknown,
  offsetValue: unknown,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 200;

  let limit = Number(limitValue);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = defaultLimit;
  }
  limit = Math.min(limit, maxLimit);

  let offset = Number(offsetValue);
  if (!Number.isFinite(offset) || offset < 0) {
    offset = 0;
  }

  return { limit, offset };
}

export function assignIfDefined<T extends Record<string, any>>(target: T, key: keyof T, value: any): void {
  if (value !== undefined) {
    (target as any)[key] = value;
  }
}

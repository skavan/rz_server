/**
 * Validation Tests
 * 
 * Tests for shared Zod validators to ensure proper form validation behavior
 */

import { describe, it, expect } from 'vitest';
import { 
  dateFieldValidator, 
  cadenceJsonFieldValidator, 
  tagIdsValidator, 
  parentIdValidator 
} from './zod.js';

describe('dateFieldValidator', () => {
  it('should handle empty strings as null', () => {
    const result = dateFieldValidator.parse('');
    expect(result).toBeNull();
  });

  it('should handle null values', () => {
    const result = dateFieldValidator.parse(null);
    expect(result).toBeNull();
  });

  it('should handle undefined values', () => {
    const result = dateFieldValidator.parse(undefined);
    expect(result).toBeNull();
  });

  it('should handle Date objects', () => {
    const testDate = new Date('2024-01-15');
    const result = dateFieldValidator.parse(testDate);
    expect(result).toEqual(testDate);
  });

  it('should parse ISO date strings (YYYY-MM-DD)', () => {
    const result = dateFieldValidator.parse('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getUTCFullYear()).toBe(2024);
    expect(result?.getUTCMonth()).toBe(0); // January is 0
    expect(result?.getUTCDate()).toBe(15);
  });

  it('should handle other date string formats', () => {
    const result = dateFieldValidator.parse('2024-01-15T10:30:00Z');
    expect(result).toBeInstanceOf(Date);
  });
});

describe('cadenceJsonFieldValidator', () => {
  it('should handle empty string as null', () => {
    const result = cadenceJsonFieldValidator.parse('');
    expect(result).toBeNull();
  });

  it('should handle null values', () => {
    const result = cadenceJsonFieldValidator.parse(null);
    expect(result).toBeNull();
  });

  it('should handle valid cadence config', () => {
    const config = { targetDays: 7, maxDays: 14 };
    const result = cadenceJsonFieldValidator.parse(config);
    expect(result).toEqual(config);
  });

  it('should handle partial cadence config', () => {
    const config = { targetDays: 7 };
    const result = cadenceJsonFieldValidator.parse(config);
    expect(result).toEqual(config);
  });

  it('should reject empty objects', () => {
    expect(() => cadenceJsonFieldValidator.parse({})).toThrow();
  });

  it('should reject invalid numbers', () => {
    expect(() => cadenceJsonFieldValidator.parse({ targetDays: -1 })).toThrow();
    expect(() => cadenceJsonFieldValidator.parse({ maxDays: 0 })).toThrow();
  });
});

describe('tagIdsValidator', () => {
  it('should handle undefined as undefined', () => {
    const result = tagIdsValidator.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('should handle array of numbers', () => {
    const result = tagIdsValidator.parse([1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should convert string numbers to integers', () => {
    const result = tagIdsValidator.parse(['1', '2', '3']);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should handle mixed number and string arrays', () => {
    const result = tagIdsValidator.parse([1, '2', 3, '4']);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should reject invalid string formats', () => {
    expect(() => tagIdsValidator.parse(['not-a-number'])).toThrow();
    expect(() => tagIdsValidator.parse(['1.5'])).toThrow();
  });

  it('should handle empty arrays', () => {
    const result = tagIdsValidator.parse([]);
    expect(result).toEqual([]);
  });
});

describe('parentIdValidator', () => {
  it('should handle empty string as undefined', () => {
    const result = parentIdValidator.parse('');
    expect(result).toBeUndefined();
  });

  it('should handle null as undefined', () => {
    const result = parentIdValidator.parse(null);
    expect(result).toBeUndefined();
  });

  it('should handle undefined', () => {
    const result = parentIdValidator.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('should convert string numbers to integers', () => {
    const result = parentIdValidator.parse('123');
    expect(result).toBe(123);
  });

  it('should handle number inputs', () => {
    const result = parentIdValidator.parse(123);
    expect(result).toBe(123);
  });

  it('should reject negative numbers', () => {
    expect(() => parentIdValidator.parse(-1)).toThrow();
  });

  it('should reject zero', () => {
    expect(() => parentIdValidator.parse(0)).toThrow();
  });

  it('should reject decimal numbers', () => {
    expect(() => parentIdValidator.parse(1.5)).toThrow();
  });
});

describe('Integration: UnifiedLocationsForm validation', () => {
  it('should validate individual validator components work together', () => {
    // Test that our validators work in combination like they would in the real form
    const formData = {
      parentId: '123',        // Should become 123
      lastChecked: '2024-01-15',   // Should become Date
      tagIds: ['1', '2', '3'],     // Should become [1, 2, 3]  
      cleaningCadence: { targetDays: 7, maxDays: 14 }
    };

    const parentResult = parentIdValidator.parse(formData.parentId);
    const dateResult = dateFieldValidator.parse(formData.lastChecked);
    const tagResult = tagIdsValidator.parse(formData.tagIds);
    const cadenceResult = cadenceJsonFieldValidator.parse(formData.cleaningCadence);

    expect(parentResult).toBe(123);
    expect(dateResult).toBeInstanceOf(Date);
    expect(tagResult).toEqual([1, 2, 3]);
    expect(cadenceResult).toEqual({ targetDays: 7, maxDays: 14 });
  });
});

/**
 * Validation Demo
 * 
 * Manual test to show how the shared validators work with real form data
 */

import { 
  dateFieldValidator, 
  cadenceJsonFieldValidator, 
  tagIdsValidator, 
  parentIdValidator,
  locationsValidationSchema 
} from './zod.js';

// Simulate form data as it comes from a web form
const rawFormData = {
  name: 'Kitchen Storage',
  locationTypeId: '2',
  parentId: '5',           // String from form input
  tagIds: ['1', '3', '5'], // String array from multi-select
  isActive: true,
  lastChecked: '2024-01-15',    // Date string from date input
  lastCleaned: '2024-01-10',    // Date string from date input
  cleaningCadence: { targetDays: 7, maxDays: 14 },
  checkingCadence: { targetDays: 3 },
  notes: 'Main kitchen storage area',
  computedInventoryCount: 25,
  computedProductCount: 8
};

console.log('🧪 Testing shared validators with form data...\n');

// Test individual validators
console.log('📅 Date validation:');
const checkedDate = dateFieldValidator.parse(rawFormData.lastChecked);
console.log('  Input:', rawFormData.lastChecked);
console.log('  Output:', checkedDate);
console.log('  Type:', typeof checkedDate, '\n');

console.log('👥 Parent ID validation:');
const parentId = parentIdValidator.parse(rawFormData.parentId);
console.log('  Input:', rawFormData.parentId, '(string)');
console.log('  Output:', parentId, '(number)\n');

console.log('🏷️  Tag IDs validation:');
const tagIds = tagIdsValidator.parse(rawFormData.tagIds);
console.log('  Input:', rawFormData.tagIds, '(string array)');
console.log('  Output:', tagIds, '(number array)\n');

console.log('⏰ Cadence validation:');
const cleaningCadence = cadenceJsonFieldValidator.parse(rawFormData.cleaningCadence);
console.log('  Input:', rawFormData.cleaningCadence);
console.log('  Output:', cleaningCadence, '\n');

// Test complete validation schema (like UnifiedLocationsForm uses)
console.log('🔄 Complete form validation (like UnifiedLocationsForm):');
const { z } = await import('zod');
const locationTypeIdValidator = z.preprocess(
  (value) => (value === '' || value == null ? null : Number(value)),
  z.number().int().positive().nullable()
);
const formSchema = locationsValidationSchema.extend({
  locationTypeId: locationTypeIdValidator,
  parentId: parentIdValidator,
  lastChecked: dateFieldValidator,
  lastCleaned: dateFieldValidator,
  cleaningCadence: cadenceJsonFieldValidator,
  checkingCadence: cadenceJsonFieldValidator,
  tagIds: tagIdsValidator,
  computedInventoryCount: z.any().optional(),
  computedProductCount: z.any().optional(),
});

try {
  const validatedData = formSchema.parse(rawFormData);
  console.log('✅ Form validation PASSED');
  console.log('🎯 Processed data:', {
    parentId: validatedData.parentId,
    locationTypeId: validatedData.locationTypeId,
    lastChecked: validatedData.lastChecked instanceof Date ? validatedData.lastChecked.toISOString().split('T')[0] : validatedData.lastChecked,
    tagIds: validatedData.tagIds,
    cleaningCadence: validatedData.cleaningCadence
  });
} catch (error: any) {
  console.log('❌ Form validation FAILED:', error?.message || 'Unknown error');
}

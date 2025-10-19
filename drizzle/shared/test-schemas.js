import { 
  productsValidationSchema,
  skusValidationSchema,
  inventoryItemsValidationSchema 
} from './dist/zod.js';
import { z } from 'zod';

console.log('=== PRODUCTS VALIDATION SCHEMA (with defaults) ===\n');

// Example 1: Minimal form data (just required fields)
const minimalProduct = {
  name: 'New Laptop',
  slug: 'new-laptop'
};

console.log('Input (minimal):');
console.log(JSON.stringify(minimalProduct, null, 2));

const productResult = productsValidationSchema.safeParse(minimalProduct);
console.log('\nOutput after Zod parsing (productsValidationSchema):');
console.log(JSON.stringify(productResult.data, null, 2));
console.log('\n✅ Notice: isVisible, isActive, hasMediaAssets, and kind are auto-populated!');

// Example 2: Form with some fields explicitly set
const partialProduct = {
  name: 'Gaming Mouse',
  slug: 'gaming-mouse',
  isVisible: false,  // Explicitly set to false
  categoryId: 5
};

console.log('\n\nInput (with explicit isVisible=false):');
console.log(JSON.stringify(partialProduct, null, 2));

const productResult2 = productsValidationSchema.safeParse(partialProduct);
console.log('\nOutput after Zod parsing (productsValidationSchema):');
console.log(JSON.stringify(productResult2.data, null, 2));
console.log('\n✅ Notice: Explicit false is preserved, but other defaults still apply!');

console.log('\n\n=== SKUS VALIDATION SCHEMA (with defaults) ===\n');

const minimalSku = {
  name: 'Model X Pro',
  skuCode: 'SKU-001'
};

console.log('Input (minimal):');
console.log(JSON.stringify(minimalSku, null, 2));

const skuResult = skusValidationSchema.safeParse(minimalSku);
console.log('\nOutput after Zod parsing (skusValidationSchema):');
console.log(JSON.stringify(skuResult.data, null, 2));
console.log('\n✅ Notice: hasMediaAssets, kind, and status are auto-populated!');

console.log('\n\n=== INVENTORY ITEMS VALIDATION SCHEMA (with defaults) ===\n');

const minimalInventory = {
  customerId: 1,
  homeId: 2,
  skuId: 10,
  productId: 5
};

console.log('Input (minimal required fields):');
console.log(JSON.stringify(minimalInventory, null, 2));

const inventoryResult = inventoryItemsValidationSchema.safeParse(minimalInventory);
console.log('\nOutput after Zod parsing (inventoryItemsValidationSchema):');
console.log(JSON.stringify(inventoryResult.data, null, 2));
console.log('\n✅ Notice: 7 fields auto-populated with defaults!');

console.log('\n\n=== EXTENDING THE VALIDATION SCHEMA ===\n');

// Show that you can further extend it
const customProductSchema = productsValidationSchema.extend({
  name: z.string().min(1, "Name is required"),
  categoryId: z.number().int().positive("Category is required"),
});

console.log('Extended schema with custom validations:');
const extendedTest = customProductSchema.safeParse({
  name: 'Gaming Laptop',
  slug: 'gaming-laptop',
  categoryId: 5
});

if (extendedTest.success) {
  console.log(JSON.stringify(extendedTest.data, null, 2));
  console.log('\n✅ Custom validation + defaults work together perfectly!');
}

console.log('\n\n=== SUMMARY ===\n');
console.log('Available schemas (one per table, with defaults built-in):');
console.log('  productsValidationSchema, skusValidationSchema, inventoryItemsValidationSchema');
console.log('  categoriesValidationSchema, brandsValidationSchema, vendorsValidationSchema');
console.log('  homesValidationSchema, tagsValidationSchema, locationsValidationSchema');
console.log('\nSimply import and use - defaults are included. Extend if you need custom validation!');

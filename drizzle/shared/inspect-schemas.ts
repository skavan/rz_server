/**
 * Schema Inspector - View all validation schema fields
 * Run with: npx tsx inspect-schemas.ts
 */

import { 
  inventoryItemValidationSchema,
  productValidationSchema,
  skuValidationSchema,
  locationValidationSchema 
} from './src/index.js';

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║        VALIDATION SCHEMA INSPECTOR                        ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Helper to display schema fields nicely
function inspectSchema(name: string, schema: any) {
  console.log(`\n📋 ${name.toUpperCase()}`);
  console.log('─'.repeat(60));
  
  const fields = Object.keys(schema.shape);
  console.log(`Fields (${fields.length}):`);
  
  fields.forEach((field, index) => {
    const fieldSchema = schema.shape[field];
    const typeName = fieldSchema._def?.typeName || 'Unknown';
    const isOptional = fieldSchema.isOptional() ? '(optional)' : '(required)';
    
    console.log(`  ${index + 1}. ${field} - ${typeName} ${isOptional}`);
  });
}

// Inspect each schema
inspectSchema('Inventory Items', inventoryItemValidationSchema);
inspectSchema('Products', productValidationSchema);
inspectSchema('SKUs', skuValidationSchema);
inspectSchema('Locations', locationValidationSchema);

// Test parsing empty object to see required fields
console.log('\n\n🔍 REQUIRED FIELDS TEST');
console.log('─'.repeat(60));

const schemas = {
  'Inventory Items': inventoryItemValidationSchema,
  'Products': productValidationSchema,
  'SKUs': skuValidationSchema,
  'Locations': locationValidationSchema
};

Object.entries(schemas).forEach(([name, schema]) => {
  const result = schema.safeParse({});
  if (!result.success) {
    console.log(`\n${name} - Required fields:`);
    const requiredFields = result.error.errors
      .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
      .map(e => e.path.join('.'));
    requiredFields.forEach(field => console.log(`  ✓ ${field}`));
  } else {
    console.log(`\n${name} - No required fields (all optional)`);
  }
});

console.log('\n✅ Inspection complete!\n');

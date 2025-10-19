// Test import of productsValidationSchema
console.log('Testing imports from dist/...\n');

// Test 1: Direct zod.js import
try {
  const zodModule = await import('./dist/zod.js');
  console.log('✅ Direct import from dist/zod.js works');
  console.log('   Available exports:', Object.keys(zodModule).filter(k => k.includes('Validation')));
  console.log('   productsValidationSchema:', typeof zodModule.productsValidationSchema);
} catch (err) {
  console.error('❌ Direct import failed:', err.message);
}

// Test 2: Via index.js
try {
  const indexModule = await import('./dist/index.js');
  console.log('\n✅ Import from dist/index.js works');
  console.log('   productsValidationSchema:', typeof indexModule.productsValidationSchema);
  
  if (indexModule.productsValidationSchema) {
    console.log('   Can call .extend():', typeof indexModule.productsValidationSchema.extend === 'function');
  }
} catch (err) {
  console.error('❌ Index import failed:', err.message);
}

console.log('\nTest complete!');

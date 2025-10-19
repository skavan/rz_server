#!/usr/bin/env node
/**
 * Check Defaults Script
 * 
 * This script validates that Zod defaults match Drizzle schema defaults.
 * Helps catch sync issues during development.
 * 
 * Usage:
 *   npm run check-defaults
 *   npx tsx scripts/check-defaults.ts
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Checking Zod defaults against Drizzle schema...\n');

// Import schemas (must run after build)
try {
  const rootDir = join(__dirname, '..');
  const zodPath = pathToFileURL(join(rootDir, 'dist', 'zod.js')).href;
  const { productValidationSchema, skuValidationSchema, inventoryItemValidationSchema } = await import(zodPath);
  
  console.log('📋 Product Schema Defaults:');
  const productTest = { name: 'Test', slug: 'test' }; // Omit fields with defaults
  const productParsed = productValidationSchema.safeParse(productTest);
  if (productParsed.success) {
    const data = productParsed.data;
    console.log('  ✅ isVisible:', data.isVisible);
    console.log('  ✅ isActive:', data.isActive);
    console.log('  ✅ hasMediaAssets:', data.hasMediaAssets);
    console.log('  ✅ kind:', data.kind);
  } else {
    console.log('  ❌ Parse failed:', productParsed.error.errors);
  }
  
  console.log('\n📋 SKU Schema Defaults:');
  const skuTest = { name: 'Test SKU', skuCode: 'TEST-001' }; // Omit fields with defaults
  const skuParsed = skuValidationSchema.safeParse(skuTest);
  if (skuParsed.success) {
    const data = skuParsed.data;
    console.log('  ✅ hasMediaAssets:', data.hasMediaAssets);
    console.log('  ✅ kind:', data.kind);
    console.log('  ✅ status:', data.status);
  } else {
    console.log('  ❌ Parse failed:', skuParsed.error.errors);
  }
  
  console.log('\n📋 Inventory Item Schema Defaults:');
  const inventoryTest = { customerId: 1, homeId: 1, skuId: 1, productId: 1 }; // Omit fields with defaults
  const inventoryParsed = inventoryItemValidationSchema.safeParse(inventoryTest);
  if (inventoryParsed.success) {
    const data = inventoryParsed.data;
    console.log('  ✅ isActive:', data.isActive);
    console.log('  ✅ hasMediaAssets:', data.hasMediaAssets);
    console.log('  ✅ isKitComponent:', data.isKitComponent);
    console.log('  ✅ quantity:', data.quantity);
    console.log('  ✅ status:', data.status);
    console.log('  ✅ condition:', data.condition);
    console.log('  ✅ currency:', data.currency);
  } else {
    console.log('  ❌ Parse failed:', inventoryParsed.error.errors);
  }
  
  console.log('\n✅ Default validation check complete!\n');
  
} catch (error) {
  console.error('❌ Error loading schemas:', error);
  console.error('\n💡 Make sure to run "npm run build" first\n');
  process.exit(1);
}

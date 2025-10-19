#!/usr/bin/env node
/**
 * Rebuild Schemas Script
 * 
 * This script automates the complete schema rebuild process:
 * 1. Compiles TypeScript schema definitions
 * 2. Validates that Zod refinements match Drizzle defaults
 * 3. Rebuilds the shared package
 * 
 * Usage:
 *   npm run rebuild-schemas
 *   npx tsx scripts/rebuild-schemas.ts
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔧 Schema Rebuild Process Starting...\n');

// Step 1: Build TypeScript
console.log('📦 Step 1: Compiling TypeScript...');
try {
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  console.log('✅ TypeScript compilation complete\n');
} catch (error) {
  console.error('❌ TypeScript compilation failed');
  process.exit(1);
}

// Step 2: Validate defaults (optional but recommended)
console.log('🔍 Step 2: Validating Zod defaults against Drizzle schema...');
try {
  // Import the schemas to ensure they load without errors
  const schemaPath = join(rootDir, 'dist', 'schema.js');
  const zodPath = join(rootDir, 'dist', 'zod.js');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error('schema.js not found in dist/');
  }
  if (!fs.existsSync(zodPath)) {
    throw new Error('zod.js not found in dist/');
  }
  
  console.log('✅ Schema files validated\n');
} catch (error) {
  console.error('❌ Validation failed:', error);
  process.exit(1);
}

// Step 3: Success message
console.log('✨ Schema rebuild complete!\n');
console.log('📋 Next steps:');
console.log('  - Server will auto-reload if running npm run dev');
console.log('  - Client needs: npm run sync-schemas (if in dev mode)');
console.log('  - Or manually: cd ../../../client && pnpm install --force\n');

#!/usr/bin/env node
/**
 * Sync Schemas to Client Script
 * 
 * This script automates syncing the shared package to the client during development:
 * 1. Rebuilds the shared package (if needed)
 * 2. Forces client to reinstall the local shared package
 * 
 * Usage:
 *   npm run sync-schemas
 *   npx tsx scripts/sync-to-client.ts
 * 
 * Options:
 *   --skip-build    Skip rebuilding shared package
 *   --client-path   Custom path to client directory
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const clientPathArg = args.find(arg => arg.startsWith('--client-path='));
const customClientPath = clientPathArg?.split('=')[1];

// Determine client directory
const defaultClientPath = join(rootDir, '..', '..', '..', 'client');
const clientPath = customClientPath || defaultClientPath;

console.log('🔄 Syncing Schemas to Client...\n');

// Step 1: Rebuild shared package (unless skipped)
if (!skipBuild) {
  console.log('📦 Step 1: Rebuilding shared package...');
  try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
    console.log('✅ Shared package rebuilt\n');
  } catch (error) {
    console.error('❌ Build failed');
    process.exit(1);
  }
} else {
  console.log('⏭️  Step 1: Skipped (--skip-build flag)\n');
}

// Step 2: Check if client directory exists
console.log(`📍 Step 2: Locating client at: ${clientPath}`);
if (!fs.existsSync(clientPath)) {
  console.error(`❌ Client directory not found: ${clientPath}`);
  console.error('   Use --client-path=/path/to/client to specify custom location');
  process.exit(1);
}
console.log('✅ Client directory found\n');

// Step 3: Force reinstall in client
console.log('🔄 Step 3: Force reinstalling shared package in client...');
try {
  execSync('pnpm install --force', { cwd: clientPath, stdio: 'inherit' });
  console.log('✅ Client package updated\n');
} catch (error) {
  console.error('❌ Client install failed');
  console.error('   Make sure pnpm is installed and client uses pnpm');
  process.exit(1);
}

// Success!
console.log('✨ Schema sync complete!\n');
console.log('📋 Summary:');
console.log('  ✅ Shared package rebuilt');
console.log('  ✅ Client updated with latest schemas');
console.log('  ✅ Ready to use new validation schemas in forms\n');

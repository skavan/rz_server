/**
 * Update Drizzle-Shared Package
 * 
 * Complete workflow to update the shared package:
 * 1. Generate Zod schema examples (for reference)
 * 2. Build the shared package
 * 3. Show instructions for client sync
 * 
 * Run from drizzle/shared directory:
 * tsx scripts/update-drizzle-shared.ts
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedDir = join(__dirname, '..');

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  🚀 UPDATING DRIZZLE-SHARED PACKAGE');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Step 1: Generate Zod examples
console.log('📝 Step 1: Generating Zod schema examples...');
console.log('   Location: zod-examples/');
console.log('');

try {
  execSync('tsx scripts/generate-zod-examples.ts', {
    cwd: sharedDir,
    stdio: 'inherit',
  });
} catch (error) {
  console.error('❌ Failed to generate Zod examples');
  process.exit(1);
}

console.log('');

// Step 2: Build the package
console.log('🔨 Step 2: Building shared package...');
console.log('   Compiling TypeScript → JavaScript');
console.log('   Generating types');
console.log('');

try {
  execSync('npm run build', {
    cwd: sharedDir,
    stdio: 'inherit',
  });
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  ✅ DRIZZLE-SHARED UPDATE COMPLETE');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Step 3: Show client sync instructions
console.log('📦 Package updated successfully!');
console.log('');
console.log('🔄 NEXT STEPS - Sync to Clients:');
console.log('');
console.log('1️⃣  Server (rz_server):');
console.log('   The server uses this package directly - already synced!');
console.log('');
console.log('2️⃣  Client (declarative-client):');
console.log('   ⚠️  You must manually sync the package to the client:');
console.log('');
console.log('   cd ../declarative-client');
console.log('   pnpm install --force');
console.log('');
console.log('   The --force flag ensures pnpm picks up the rebuilt package.');
console.log('');
console.log('📖 Reference Files:');
console.log('   Zod schema examples: drizzle/shared/zod-examples/');
console.log('   These files show the final schemas clients will use.');
console.log('   ⚠️  For reference only - do not import in code!');
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

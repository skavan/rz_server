#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const steps = [
  {
    label: 'Applying database migrations (server/db:migrate)',
    command: 'npm run db:migrate --prefix server',
  },
  {
    label: 'Rebuilding shared Drizzle package (drizzle/shared)',
    command: 'npm run build --prefix drizzle/shared',
  },
];

for (const step of steps) {
  console.log(`\n▶️  ${step.label}`);
  try {
    execSync(step.command, { cwd: repoRoot, stdio: 'inherit' });
    console.log('✅ Step completed');
  } catch (error) {
    console.error(`❌ ${step.label} failed`);
    process.exit(1);
  }
}

console.log('\n✨ Database + shared schema sync complete.');

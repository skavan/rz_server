import { readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { POLICY_FILES } from './policy-list.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

async function applyPolicyFile(pool: Pool, sqlPath: string, fileName: string) {
  const sql = await readFile(sqlPath, 'utf-8');
  
  // Smart statement parsing that handles DO blocks properly
  const statements: string[] = [];
  let currentStatement = '';
  let inDoBlock = false;
  
  const lines = sql.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip comment-only lines
    if (trimmedLine.startsWith('--') || trimmedLine === '') {
      continue;
    }
    
    currentStatement += line + '\n';
    
    // Detect start of DO block
    if (trimmedLine.startsWith('DO $do$')) {
      inDoBlock = true;
    }
    
    // Detect end of DO block (handle both with and without LANGUAGE plpgsql)
    if (inDoBlock && (trimmedLine === '$do$;' || trimmedLine.endsWith('$do$ LANGUAGE plpgsql;'))) {
      inDoBlock = false;
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
    // Regular statement end (not in DO block)
    else if (!inDoBlock && trimmedLine.endsWith(';')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }
  
  // Handle any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }
  
  // Filter empty statements
  const validStatements = statements.filter(s => s && s !== ';');

  console.log(`\n📋 Processing ${fileName} (${validStatements.length} statements)`);
  
  for (const [i, stmt] of validStatements.entries()) {
    if (!stmt || stmt === ';') continue;
    
    try {
      await pool.query(stmt);
      
      // Show progress for longer operations
      if (validStatements.length > 1) {
        console.log(`  ✅ [${i + 1}/${validStatements.length}] Statement executed`);
      } else {
        console.log(`  ✅ Statement executed`);
      }
      
    } catch (err) {
      const error = err as Error;
      
      // Don't treat "already exists" as an error
      if (error.message.includes('already exists') || error.message.includes('does not exist')) {
        console.log(`  ℹ️  [${i + 1}/${validStatements.length}] ${error.message}`);
      } else {
        console.error(`  ❌ [${i + 1}/${validStatements.length}] ${error.message}`);
      }
    }
  }
  
  console.log(`✅ Completed ${fileName}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  
  const pool = new Pool({ connectionString: url });
  
  try {
    console.log(`\n🔐 Applying RLS policies from ${POLICY_FILES.length} files`);
    
    for (const fileName of POLICY_FILES) {
      const sqlPath = join(__dirname, 'policies', fileName);
      await applyPolicyFile(pool, sqlPath, fileName);
    }
    
    console.log('\n🎉 All RLS policies applied successfully!');
    
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ RLS apply error:', err);
  process.exit(1);
});

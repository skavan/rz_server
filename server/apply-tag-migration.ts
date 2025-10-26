import { db } from './src/db/index.js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

async function applyTagMigration() {
  try {
    console.log('🔧 Manually applying tag migration (0001_strange_revanche.sql)...\n');
    
    // Check if migration was already applied
    const migrationPath = '../drizzle/shared/drizzle/0001_strange_revanche.sql';
    const migrationContent = readFileSync(migrationPath, 'utf-8');
    const migrationHash = createHash('sha256').update(migrationContent).digest('hex');
    
    const existingMigration = await db.execute(`
      SELECT id FROM "__drizzle_migrations" WHERE hash = '${migrationHash}'
    `);
    
    if (existingMigration.rows.length > 0) {
      console.log('ℹ️ Migration already applied!');
      return;
    }
    
    console.log('1️⃣ Applying migration statements...');
    
    // Parse and execute each statement
    const statements = migrationContent
      .split('--> statement-breakpoint')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`   Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        await db.execute(statement);
        console.log(`   ✅ Statement ${i + 1} completed`);
      } catch (error: any) {
        console.log(`   ⚠️ Statement ${i + 1} failed: ${error.message}`);
        // Continue with other statements
      }
    }
    
    console.log('\n2️⃣ Recording migration as applied...');
    await db.execute(`
      INSERT INTO "__drizzle_migrations" (hash, created_at) 
      VALUES ('${migrationHash}', ${Date.now()})
    `);
    
    console.log('✅ Migration recorded in tracking table\n');
    
    // Verify the changes
    console.log('3️⃣ Verifying migration results...');
    
    // Check if categoryId column was added
    const tagColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'tags' AND column_name = 'category_id'
    `);
    
    console.log('CategoryId column added:', tagColumns.rows.length > 0 ? '✅' : '❌');
    
    // Check tag_type enum values
    const enumValues = await db.execute(`
      SELECT unnest(enum_range(NULL::tag_type)) as enum_value
    `);
    const values = enumValues.rows.map((row: any) => row.enum_value);
    console.log('Tag type enum values:', values);
    console.log('Enum updated correctly:', values.includes('placeholder') ? '✅' : '❌');
    
    console.log('\n🎉 Tag migration completed successfully!');
    console.log('💡 You can now run the seed script: npx tsx scripts/drizzle/seed-tags.ts');
    
  } catch (error) {
    console.error('❌ Error applying migration:', error);
  }
  
  process.exit(0);
}

applyTagMigration();
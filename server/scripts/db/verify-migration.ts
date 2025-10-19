/**
 * Verify migration completed successfully
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verifying migration results...\n');
    
    // Check 1: Verify is_kit column is gone
    console.log('Check 1: Verifying is_kit column is removed...');
    const columnsCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name IN ('is_kit', 'kind')
    `);
    
    const hasIsKit = columnsCheck.rows.some(r => r.column_name === 'is_kit');
    const hasKind = columnsCheck.rows.some(r => r.column_name === 'kind');
    
    if (hasIsKit) {
      console.log('❌ FAIL: is_kit column still exists!');
      return false;
    }
    if (!hasKind) {
      console.log('❌ FAIL: kind column does not exist!');
      return false;
    }
    console.log('✅ PASS: is_kit removed, kind exists\n');
    
    // Check 2: Verify kind values are valid
    console.log('Check 2: Verifying kind values...');
    const kindValues = await client.query(`
      SELECT kind, COUNT(*) as count 
      FROM products 
      GROUP BY kind 
      ORDER BY kind
    `);
    
    console.log('Products by kind:', kindValues.rows);
    
    const invalidKind = await client.query(`
      SELECT COUNT(*) as count 
      FROM products 
      WHERE kind NOT IN ('simple', 'bom')
    `);
    
    if (parseInt(invalidKind.rows[0].count) > 0) {
      console.log(`❌ FAIL: Found ${invalidKind.rows[0].count} products with invalid kind values!`);
      return false;
    }
    console.log('✅ PASS: All products have valid kind values\n');
    
    // Check 3: Verify index exists
    console.log('Check 3: Verifying indexes...');
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'products' 
      AND indexname IN ('idx_products_kit', 'idx_products_kind')
    `);
    
    const hasOldIndex = indexes.rows.some(r => r.indexname === 'idx_products_kit');
    const hasNewIndex = indexes.rows.some(r => r.indexname === 'idx_products_kind');
    
    if (hasOldIndex) {
      console.log('❌ FAIL: Old idx_products_kit still exists!');
      return false;
    }
    if (!hasNewIndex) {
      console.log('❌ FAIL: New idx_products_kind does not exist!');
      return false;
    }
    console.log('✅ PASS: Old index removed, new index exists\n');
    
    // Check 4: Verify SKU kind values
    console.log('Check 4: Verifying SKU kind values...');
    const skuKindValues = await client.query(`
      SELECT kind, COUNT(*) as count 
      FROM skus 
      GROUP BY kind 
      ORDER BY kind
    `);
    
    console.log('SKUs by kind:', skuKindValues.rows);
    
    const hasKitSku = await client.query(`
      SELECT COUNT(*) as count 
      FROM skus 
      WHERE kind = 'kit'
    `);
    
    if (parseInt(hasKitSku.rows[0].count) > 0) {
      console.log(`❌ FAIL: Found ${hasKitSku.rows[0].count} SKUs still using kind='kit'!`);
      return false;
    }
    console.log('✅ PASS: All SKUs migrated from kit to bom\n');
    
    // Summary
    console.log('═══════════════════════════════════════════════');
    console.log('🎉 ALL CHECKS PASSED!');
    console.log('═══════════════════════════════════════════════');
    console.log('\n✅ Migration completed successfully!');
    console.log('✅ Data integrity verified');
    console.log('✅ Schema changes applied correctly');
    console.log('\nYou can now:');
    console.log('  1. Restart your server');
    console.log('  2. Update client apps to use "kind" field');
    console.log('  3. Test API endpoints\n');
    
    return true;
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyMigration().then(success => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Safe migration script for harmonizing kind field
 * Runs migration with transaction safety and verification
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Starting migration: Harmonize kind field...\n');
    
    // Start transaction for safety
    await client.query('BEGIN');
    
    console.log('📊 BEFORE migration - Current state:');
    
    // Check current products state
    const beforeProducts = await client.query(`
      SELECT 
        CASE WHEN is_kit THEN 'is_kit=true' ELSE 'is_kit=false' END as status,
        COUNT(*) as count
      FROM products 
      GROUP BY is_kit
      ORDER BY is_kit DESC
    `);
    console.log('Products by is_kit:', beforeProducts.rows);
    
    // Check current SKUs state
    const beforeSkus = await client.query(`
      SELECT kind, COUNT(*) as count 
      FROM skus 
      GROUP BY kind 
      ORDER BY kind
    `);
    console.log('SKUs by kind:', beforeSkus.rows);
    
    console.log('\n🔧 Running migration steps...\n');
    
    // Step 1: Add kind column to products
    console.log('Step 1: Adding kind column to products...');
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'simple' NOT NULL
    `);
    console.log('✅ Added kind column\n');
    
    // Step 2: Migrate data
    console.log('Step 2: Migrating is_kit=true to kind=\'bom\'...');
    const migrateResult = await client.query(`
      UPDATE products 
      SET kind = 'bom' 
      WHERE is_kit = true
    `);
    console.log(`✅ Migrated ${migrateResult.rowCount} products to kind='bom'\n`);
    
    // Step 3: Verify migration before dropping column
    console.log('Step 3: Verifying data migration...');
    const verification = await client.query(`
      SELECT 
        is_kit,
        kind,
        COUNT(*) as count
      FROM products
      GROUP BY is_kit, kind
      ORDER BY is_kit DESC, kind
    `);
    console.log('Verification - Products by (is_kit, kind):', verification.rows);
    
    // Safety check: Ensure no data mismatch
    const mismatch = await client.query(`
      SELECT COUNT(*) as count
      FROM products
      WHERE (is_kit = true AND kind != 'bom')
         OR (is_kit = false AND kind != 'simple')
    `);
    
    if (parseInt(mismatch.rows[0].count) > 0) {
      throw new Error(`❌ Data mismatch detected! ${mismatch.rows[0].count} rows have inconsistent is_kit/kind values`);
    }
    console.log('✅ Data verification passed - no mismatches\n');
    
    // Step 4: Drop old column and index
    console.log('Step 4: Dropping is_kit column and old index...');
    await client.query('DROP INDEX IF EXISTS idx_products_kit');
    await client.query('ALTER TABLE products DROP COLUMN is_kit');
    console.log('✅ Dropped is_kit column and index\n');
    
    // Step 5: Create new index
    console.log('Step 5: Creating new index on kind...');
    await client.query('CREATE INDEX idx_products_kind ON products(kind)');
    console.log('✅ Created idx_products_kind\n');
    
    // Step 6: Update SKUs
    console.log('Step 6: Updating SKUs kind=\'kit\' to kind=\'bom\'...');
    const skuResult = await client.query(`
      UPDATE skus 
      SET kind = 'bom' 
      WHERE kind = 'kit'
    `);
    console.log(`✅ Updated ${skuResult.rowCount} SKUs\n`);
    
    console.log('📊 AFTER migration - Final state:');
    
    // Check final products state
    const afterProducts = await client.query(`
      SELECT kind, COUNT(*) as count 
      FROM products 
      GROUP BY kind 
      ORDER BY kind
    `);
    console.log('Products by kind:', afterProducts.rows);
    
    // Check final SKUs state
    const afterSkus = await client.query(`
      SELECT kind, COUNT(*) as count 
      FROM skus 
      GROUP BY kind 
      ORDER BY kind
    `);
    console.log('SKUs by kind:', afterSkus.rows);
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    console.log('🎉 All data preserved and migrated safely.\n');
    
  } catch (error) {
    // Rollback on any error
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed! Transaction rolled back.');
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

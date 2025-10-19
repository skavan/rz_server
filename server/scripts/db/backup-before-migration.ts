/**
 * Backup script - Create snapshot before migration
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

async function createBackup() {
  const client = await pool.connect();
  
  try {
    console.log('📦 Creating backup of products and skus tables...\n');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../backups');
    
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Backup products
    console.log('Backing up products table...');
    const products = await client.query('SELECT * FROM products ORDER BY id');
    const productsFile = path.join(backupDir, `products_backup_${timestamp}.json`);
    fs.writeFileSync(productsFile, JSON.stringify(products.rows, null, 2));
    console.log(`✅ Backed up ${products.rows.length} products to: ${productsFile}\n`);
    
    // Backup skus
    console.log('Backing up skus table...');
    const skus = await client.query('SELECT * FROM skus ORDER BY id');
    const skusFile = path.join(backupDir, `skus_backup_${timestamp}.json`);
    fs.writeFileSync(skusFile, JSON.stringify(skus.rows, null, 2));
    console.log(`✅ Backed up ${skus.rows.length} SKUs to: ${skusFile}\n`);
    
    // Create summary
    const summary = {
      timestamp: new Date().toISOString(),
      database: process.env.DATABASE_URL?.split('@')[1]?.split('/')[1] || 'unknown',
      tables: {
        products: products.rows.length,
        skus: skus.rows.length
      },
      files: {
        products: productsFile,
        skus: skusFile
      }
    };
    
    const summaryFile = path.join(backupDir, `backup_summary_${timestamp}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log('📊 Backup Summary:');
    console.log(summary);
    console.log('\n✅ Backup completed successfully!');
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createBackup().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

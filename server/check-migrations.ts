import { db } from './src/db/index.js';

async function checkMigrationState() {
  try {
    console.log('🔍 Checking Drizzle migration state...\n');
    
    // Check if __drizzle_migrations table exists
    const migrationTableExists = await db.execute(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '__drizzle_migrations'
      )
    `);
    
    console.log('Migration table exists:', migrationTableExists.rows[0].exists);
    
    if (migrationTableExists.rows[0].exists) {
      // Check what migrations have been applied
      const appliedMigrations = await db.execute(`
        SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at
      `);
      
      console.log('\nApplied migrations:');
      console.table(appliedMigrations.rows);
    } else {
      console.log('❌ No migration tracking table found');
    }
    
  } catch (error) {
    console.error('❌ Error checking migration state:', error);
  }
  
  process.exit(0);
}

checkMigrationState();
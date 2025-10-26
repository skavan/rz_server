import { db } from './src/db/index.js';

async function checkDatabaseConnection() {
  try {
    console.log('🔍 Checking database connection...\n');
    console.log('Database URL from environment:', process.env.DATABASE_URL);
    
    const result = await db.execute('SELECT current_database(), current_user, version()');
    console.log('Connected to database:', result.rows[0].current_database);
    console.log('Connected as user:', result.rows[0].current_user);
    
    // Check if we have any tags
    const tagCount = await db.execute('SELECT COUNT(*) as count FROM tags');
    console.log('\nCurrent tag count:', tagCount.rows[0].count);
    
    // Check if we have categories
    const catCount = await db.execute('SELECT COUNT(*) as count FROM categories');
    console.log('Categories count:', catCount.rows[0].count);
    
    // Check if we have customers (needed for tags)
    const custCount = await db.execute('SELECT COUNT(*) as count FROM customers');
    console.log('Customers count:', custCount.rows[0].count);
    
    if (tagCount.rows[0].count === '0') {
      console.log('\n❌ No tags found - seed script may have failed');
      console.log('💡 Let\'s check what happened...');
      
      // Check if there are any system tags
      const systemTagCount = await db.execute('SELECT COUNT(*) as count FROM tags WHERE is_system = true');
      console.log('System tags count:', systemTagCount.rows[0].count);
    } else {
      console.log('\n✅ Tags found in database');
    }
    
  } catch (error) {
    console.error('❌ Connection error:', error);
  }
  
  process.exit(0);
}

checkDatabaseConnection();
import { db } from './src/db/index.js';

async function checkTagsTable() {
  try {
    console.log('🔍 Checking tags table structure...\n');
    
    const result = await db.execute(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'tags' 
      ORDER BY ordinal_position
    `);
    
    console.log('Tags table columns:');
    console.table(result.rows);
    
    // Check if categoryId column exists
    const hasCategoryId = result.rows.some((row: any) => row.column_name === 'category_id');
    
    if (hasCategoryId) {
      console.log('✅ categoryId column exists - migration was successful!');
    } else {
      console.log('❌ categoryId column missing - migration not applied');
    }
    
    // Check current tag_type enum values
    console.log('\n🔍 Checking tag_type enum values...');
    const enumResult = await db.execute(`
      SELECT unnest(enum_range(NULL::tag_type)) as enum_value
    `);
    console.log('tag_type enum values:', enumResult.rows.map((row: any) => row.enum_value));
    
  } catch (error) {
    console.error('❌ Error checking tags table:', error);
  }
  
  process.exit(0);
}

checkTagsTable();
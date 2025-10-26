import { db } from './src/db/index.js';

async function inspectCurrentTags() {
  try {
    console.log('🏷️ Current tags in database:\n');
    const tags = await db.execute('SELECT id, name, slug, tag_scope, category_id, is_system, locked FROM tags ORDER BY id');
    console.table(tags.rows);
    
    console.log('\n📋 Categories available:\n');
    const categories = await db.execute('SELECT id, customer_id, name, slug FROM categories ORDER BY customer_id, id LIMIT 10');
    console.table(categories.rows);
    
    console.log('\n🔍 Tag Analysis:');
    const systemTagCount = await db.execute('SELECT COUNT(*) as count FROM tags WHERE is_system = true');
    const userTagCount = await db.execute('SELECT COUNT(*) as count FROM tags WHERE is_system = false');
    
    console.log(`System tags: ${systemTagCount.rows[0].count}`);
    console.log(`User tags: ${userTagCount.rows[0].count}`);
    console.log(`Total tags: ${parseInt(systemTagCount.rows[0].count) + parseInt(userTagCount.rows[0].count)}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

inspectCurrentTags();
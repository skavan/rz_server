import { db } from './src/db/index.js';
import { tags, categories, type Tag, type Category, eq } from '@skavan/rentalzen-drizzle';

async function debugSeedTags() {
  try {
    console.log('🏷️ DEBUG: Starting tag seed debug...\n');
    
    console.log('1️⃣ Testing database connection...');
    const testResult = await db.execute('SELECT current_database()');
    console.log('✅ Connected to:', testResult.rows[0].current_database);
    
    console.log('\n2️⃣ Testing imports...');
    console.log('✅ db imported');
    console.log('✅ tags schema imported');
    console.log('✅ categories schema imported');
    console.log('✅ eq function imported');
    
    console.log('\n3️⃣ Testing categories query...');
    const allCategories: Category[] = await db.select().from(categories);
    console.log(`✅ Found ${allCategories.length} categories`);
    
    console.log('\n4️⃣ Testing tags table access...');
    const currentTags = await db.select().from(tags);
    console.log(`✅ Found ${currentTags.length} existing tags`);
    
    console.log('\n5️⃣ Testing tag deletion...');
    const deleteResult = await db.delete(tags).where(eq(tags.isSystem, true));
    console.log(`✅ Deleted system tags (if any)`);
    
    console.log('\n6️⃣ Testing tag insertion...');
    await db.insert(tags).values({
      customerId: 1,
      name: 'Test System Tag',
      slug: 'test-system-tag',
      description: 'Test tag for debugging',
      color: '#FF0000',
      categoryId: null,
      tagScope: 'all',
      tagType: 'placeholder' as any,
      isSystem: true,
      locked: true,
      isActive: true,
    });
    console.log('✅ Successfully inserted test tag');
    
    // Clean up test tag
    await db.delete(tags).where(eq(tags.slug, 'test-system-tag'));
    console.log('✅ Cleaned up test tag');
    
    console.log('\n🎉 All tests passed! The script should work...');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
  
  process.exit(0);
}

debugSeedTags();
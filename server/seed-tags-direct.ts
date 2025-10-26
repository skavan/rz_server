/**
 * Direct Tag Seed - RC1
 */

import { db } from './src/db/index.js';
import { tags, categories, type Tag, type Category, eq } from '@postgress/shared';

interface TagDefinition {
  name: string;
  slug: string;
  description: string;
  tagScope: 'product' | 'sku' | 'inventory_item' | 'location' | 'home' | 'all';
  categorySlug?: string; // null means applies to all categories
  color?: string;
}

// Define all system tags
const systemTags: TagDefinition[] = [
  // ==========================================
  // UNIVERSAL TIER TAGS (scope: all, no category restriction)
  // ==========================================
  {
    name: 'Luxury',
    slug: 'luxury',
    description: 'Premium, high-end tier product or service',
    tagScope: 'all',
    color: '#FFD700', // Gold
  },
  {
    name: 'Premium',
    slug: 'premium',
    description: 'Mid-to-high tier quality product or service',
    tagScope: 'all',
    color: '#C0C0C0', // Silver
  },
  {
    name: 'Basic',
    slug: 'basic',
    description: 'Standard, entry-level tier product or service',
    tagScope: 'all',
    color: '#CD7F32', // Bronze
  },
  {
    name: 'Commercial Grade',
    slug: 'commercial-grade',
    description: 'Designed for commercial/professional use',
    tagScope: 'all',
    color: '#4682B4', // Steel Blue
  },
  {
    name: 'Eco-Friendly',
    slug: 'eco-friendly',
    description: 'Environmentally sustainable or green certified',
    tagScope: 'all',
    color: '#228B22', // Forest Green
  },

  // ==========================================
  // ELECTRONICS SKU TAGS (scope: sku, category: electronics)
  // ==========================================
  {
    name: 'Smart Enabled',
    slug: 'smart-enabled',
    description: 'Has smart home or IoT capabilities',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#9370DB', // Medium Purple
  },
  {
    name: 'WiFi Capable',
    slug: 'wifi-capable',
    description: 'Can connect to WiFi networks',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#4169E1', // Royal Blue
  },
  {
    name: 'Energy Star',
    slug: 'energy-star',
    description: 'Energy Star certified for efficiency',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#00A651', // Energy Star Green
  },

  // ==========================================
  // LINENS SKU TAGS (scope: sku, category: linens)
  // ==========================================
  {
    name: 'Thread Count 600',
    slug: 'thread-count-600',
    description: '600 thread count',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#6495ED',
  },
  {
    name: 'Egyptian Cotton',
    slug: 'egyptian-cotton',
    description: 'Made from Egyptian cotton',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#F5DEB3',
  },

  // ==========================================
  // INVENTORY WORKFLOW TAGS (scope: inventory_item, all categories)
  // ==========================================
  {
    name: 'Needs Inspection',
    slug: 'needs-inspection',
    description: 'Item requires inspection',
    tagScope: 'inventory_item',
    color: '#FFA500', // Orange
  },
  {
    name: 'Under Warranty',
    slug: 'under-warranty',
    description: 'Currently under manufacturer warranty',
    tagScope: 'inventory_item',
    color: '#32CD32', // Lime Green
  },

  // ==========================================
  // LOCATION SPACE TAGS (scope: location, all categories)
  // ==========================================
  {
    name: 'Bedroom',
    slug: 'bedroom',
    description: 'Bedroom space',
    tagScope: 'location',
    color: '#E6E6FA', // Lavender
  },
  {
    name: 'Bathroom',
    slug: 'bathroom',
    description: 'Bathroom space',
    tagScope: 'location',
    color: '#87CEEB', // Sky Blue
  },
];

async function seedSystemTags() {
  console.log('🏷️  Starting system tags seed...\n');

  try {
    // First, clear any existing tags data
    console.log('🗑️  Clearing existing tag assignments from tables...');
    await db.execute(`UPDATE products SET tags = NULL WHERE tags IS NOT NULL`);
    await db.execute(`UPDATE skus SET tags = NULL WHERE tags IS NOT NULL`);
    await db.execute(`UPDATE locations SET tags = NULL WHERE tags IS NOT NULL`);
    await db.execute(`UPDATE inventory_items SET tags = NULL WHERE tags IS NOT NULL`);
    await db.execute(`UPDATE media_assets SET tags = NULL WHERE tags IS NOT NULL`);
    console.log('✅ Cleared tag assignments\n');

    // Get all categories for mapping slugs to IDs
    const allCategories: Category[] = await db.select().from(categories);
    const categoryMap = new Map<string, number[]>();
    
    allCategories.forEach((cat: Category) => {
      if (!categoryMap.has(cat.slug)) {
        categoryMap.set(cat.slug, []);
      }
      categoryMap.get(cat.slug)!.push(cat.id);
    });

    console.log(`📋 Found ${allCategories.length} categories across ${categoryMap.size} unique slugs\n`);

    // Delete existing system tags before reseeding
    console.log('🗑️  Removing existing system tags...');
    await db.delete(tags).where(eq(tags.isSystem, true));
    console.log('✅ Removed existing system tags\n');

    let insertedCount = 0;
    let skippedCount = 0;

    // Insert system tags
    for (const tagDef of systemTags) {
      // If tag has a category, create one for each customer's instance of that category
      if (tagDef.categorySlug) {
        const categoryIds = categoryMap.get(tagDef.categorySlug);
        
        if (!categoryIds || categoryIds.length === 0) {
          console.log(`⚠️  Warning: No categories found for slug '${tagDef.categorySlug}', skipping tag '${tagDef.name}'`);
          skippedCount++;
          continue;
        }

        // Create a tag for each category instance
        for (const categoryId of categoryIds) {
          const category = allCategories.find((c: Category) => c.id === categoryId);
          await db.insert(tags).values({
            customerId: category!.customerId,
            name: tagDef.name,
            slug: tagDef.slug,
            description: tagDef.description,
            color: tagDef.color || null,
            categoryId: categoryId,
            tagScope: tagDef.tagScope,
            tagType: 'placeholder' as any, // Cast to match enum
            isSystem: true,
            locked: true,
            isActive: true,
          });
          insertedCount++;
        }
        
        console.log(`✅ Created ${categoryIds.length} instances of '${tagDef.name}' (scope: ${tagDef.tagScope}, category: ${tagDef.categorySlug})`);
      } else {
        // Universal tag (no category restriction) - create for each customer
        const customerIds = [...new Set(allCategories.map((c: Category) => c.customerId))];
        
        for (const customerId of customerIds) {
          await db.insert(tags).values({
            customerId: customerId,
            name: tagDef.name,
            slug: tagDef.slug,
            description: tagDef.description,
            color: tagDef.color || null,
            categoryId: null, // Universal - applies to all categories
            tagScope: tagDef.tagScope,
            tagType: 'placeholder' as any,
            isSystem: true,
            locked: true,
            isActive: true,
          });
          insertedCount++;
        }
        
        console.log(`✅ Created ${customerIds.length} instances of '${tagDef.name}' (scope: ${tagDef.tagScope}, universal)`);
      }
    }

    console.log(`\n🎉 System tags seeding complete!`);
    console.log(`   Inserted: ${insertedCount} tags`);
    console.log(`   Skipped: ${skippedCount} tags`);
    console.log(`   Unique tag types: ${systemTags.length}`);

  } catch (error) {
    console.error('❌ Error seeding system tags:', error);
    throw error;
  }
}

// Always run the seed function
seedSystemTags()
  .then(() => {
    console.log('\n✨ Seed complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Seed failed:', error);
    process.exit(1);
  });
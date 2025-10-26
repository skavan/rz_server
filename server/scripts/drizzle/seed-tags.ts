/**
 * Seed System Tags - RC1
 * 
 * This script seeds the tags table with pre-defined system tags.
 * System tags provide consistent vocabulary across customers and are locked.
 * 
 * Tag Architecture:
 * - tagScope: which table(s) can use this tag ('sku', 'product', 'inventory_item', 'location', 'home', 'all')
 * - categoryId: which category this tag applies to (null = all categories)
 * - isSystem: true for pre-seeded tags (cannot be edited/deleted by users)
 * - locked: true for system tags (prevents modification)
 * 
 * Run with: npx tsx scripts/drizzle/seed-tags.ts
 */

import { db } from '../../src/db/index.js';
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
    name: 'Bluetooth',
    slug: 'bluetooth',
    description: 'Has Bluetooth connectivity',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#0082FC', // Bluetooth Blue
  },
  {
    name: 'Energy Star',
    slug: 'energy-star',
    description: 'Energy Star certified for efficiency',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#00A651', // Energy Star Green
  },
  {
    name: 'Voice Control',
    slug: 'voice-control',
    description: 'Supports voice assistant control (Alexa, Google, etc.)',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#FF6347', // Tomato
  },
  {
    name: '4K',
    slug: '4k',
    description: '4K Ultra HD resolution',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#FF1493', // Deep Pink
  },
  {
    name: 'HDR',
    slug: 'hdr',
    description: 'High Dynamic Range support',
    tagScope: 'sku',
    categorySlug: 'electronics',
    color: '#FF4500', // Orange Red
  },

  // ==========================================
  // APPLIANCES SKU TAGS (scope: sku, category: appliances)
  // ==========================================
  {
    name: 'Energy Star',
    slug: 'energy-star-appliance',
    description: 'Energy Star certified appliance',
    tagScope: 'sku',
    categorySlug: 'appliances',
    color: '#00A651',
  },
  {
    name: 'Gas',
    slug: 'gas',
    description: 'Gas-powered appliance',
    tagScope: 'sku',
    categorySlug: 'appliances',
    color: '#FF6B6B',
  },
  {
    name: 'Electric',
    slug: 'electric',
    description: 'Electric-powered appliance',
    tagScope: 'sku',
    categorySlug: 'appliances',
    color: '#FFA500',
  },
  {
    name: 'Induction',
    slug: 'induction',
    description: 'Induction cooking technology',
    tagScope: 'sku',
    categorySlug: 'appliances',
    color: '#8B4513',
  },
  {
    name: 'Self-Cleaning',
    slug: 'self-cleaning',
    description: 'Has self-cleaning capability',
    tagScope: 'sku',
    categorySlug: 'appliances',
    color: '#20B2AA',
  },
  {
    name: 'Convection',
    slug: 'convection',
    description: 'Convection heating/cooking',
    tagScope: 'sku',
    categorySlug: 'appliances',
    color: '#DC143C',
  },

  // ==========================================
  // LINENS SKU TAGS (scope: sku, category: linens)
  // ==========================================
  {
    name: 'Thread Count 300',
    slug: 'thread-count-300',
    description: '300 thread count',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#B0C4DE',
  },
  {
    name: 'Thread Count 600',
    slug: 'thread-count-600',
    description: '600 thread count',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#6495ED',
  },
  {
    name: 'Thread Count 1000',
    slug: 'thread-count-1000',
    description: '1000+ thread count premium linens',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#4169E1',
  },
  {
    name: 'Egyptian Cotton',
    slug: 'egyptian-cotton',
    description: 'Made from Egyptian cotton',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#F5DEB3',
  },
  {
    name: 'Hypoallergenic',
    slug: 'hypoallergenic',
    description: 'Hypoallergenic materials',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#98FB98',
  },
  {
    name: 'Wrinkle Resistant',
    slug: 'wrinkle-resistant',
    description: 'Wrinkle-resistant fabric',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#DDA0DD',
  },
  {
    name: 'Microfiber',
    slug: 'microfiber',
    description: 'Microfiber material',
    tagScope: 'sku',
    categorySlug: 'linens',
    color: '#E6E6FA',
  },

  // ==========================================
  // FIXTURES SKU TAGS (scope: sku, category: fixtures)
  // ==========================================
  {
    name: 'LED',
    slug: 'led',
    description: 'LED lighting technology',
    tagScope: 'sku',
    categorySlug: 'fixtures',
    color: '#FFFF00',
  },
  {
    name: 'Dimmable',
    slug: 'dimmable',
    description: 'Supports dimming control',
    tagScope: 'sku',
    categorySlug: 'fixtures',
    color: '#FFD700',
  },
  {
    name: 'Outdoor Rated',
    slug: 'outdoor-rated',
    description: 'Rated for outdoor use',
    tagScope: 'sku',
    categorySlug: 'fixtures',
    color: '#8FBC8F',
  },
  {
    name: 'Wet Rated',
    slug: 'wet-rated',
    description: 'Safe for wet/damp locations',
    tagScope: 'sku',
    categorySlug: 'fixtures',
    color: '#00CED1',
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
    name: 'Scheduled Replacement',
    slug: 'scheduled-replacement',
    description: 'Scheduled for replacement',
    tagScope: 'inventory_item',
    color: '#FF6347', // Tomato
  },
  {
    name: 'Spare',
    slug: 'spare',
    description: 'Spare/backup item',
    tagScope: 'inventory_item',
    color: '#9370DB', // Medium Purple
  },
  {
    name: 'Under Warranty',
    slug: 'under-warranty',
    description: 'Currently under manufacturer warranty',
    tagScope: 'inventory_item',
    color: '#32CD32', // Lime Green
  },
  {
    name: 'Decommissioned',
    slug: 'decommissioned',
    description: 'No longer in active use',
    tagScope: 'inventory_item',
    color: '#808080', // Gray
  },
  {
    name: 'Requires Professional Service',
    slug: 'requires-pro-service',
    description: 'Needs professional technician for service',
    tagScope: 'inventory_item',
    color: '#DC143C', // Crimson
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
  {
    name: 'Kitchen',
    slug: 'kitchen',
    description: 'Kitchen space',
    tagScope: 'location',
    color: '#FFB6C1', // Light Pink
  },
  {
    name: 'Living Room',
    slug: 'living-room',
    description: 'Living room / common area',
    tagScope: 'location',
    color: '#F0E68C', // Khaki
  },
  {
    name: 'Outdoor',
    slug: 'outdoor',
    description: 'Outdoor space',
    tagScope: 'location',
    color: '#90EE90', // Light Green
  },
  {
    name: 'Mechanical Room',
    slug: 'mechanical-room',
    description: 'Mechanical/utility room',
    tagScope: 'location',
    color: '#696969', // Dim Gray
  },
  {
    name: 'Garage',
    slug: 'garage',
    description: 'Garage space',
    tagScope: 'location',
    color: '#A9A9A9', // Dark Gray
  },
  {
    name: 'High Humidity',
    slug: 'high-humidity',
    description: 'Area with high moisture/humidity',
    tagScope: 'location',
    color: '#00BFFF', // Deep Sky Blue
  },
  {
    name: 'High Traffic',
    slug: 'high-traffic',
    description: 'High traffic area requiring durable items',
    tagScope: 'location',
    color: '#FF4500', // Orange Red
  },
  {
    name: 'Climate Controlled',
    slug: 'climate-controlled',
    description: 'Climate controlled environment',
    tagScope: 'location',
    color: '#40E0D0', // Turquoise
  },
  {
    name: 'Pet Area',
    slug: 'pet-area',
    description: 'Area used by pets',
    tagScope: 'location',
    color: '#8B4513', // Saddle Brown
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

    // Summary by scope
    const scopeCounts = {
      all: systemTags.filter(t => t.tagScope === 'all').length,
      sku: systemTags.filter(t => t.tagScope === 'sku').length,
      inventory_item: systemTags.filter(t => t.tagScope === 'inventory_item').length,
      location: systemTags.filter(t => t.tagScope === 'location').length,
      product: systemTags.filter(t => t.tagScope === 'product').length,
    };

    console.log(`\n📊 Tags by scope:`);
    console.log(`   Universal (all): ${scopeCounts.all}`);
    console.log(`   SKU: ${scopeCounts.sku}`);
    console.log(`   Inventory: ${scopeCounts.inventory_item}`);
    console.log(`   Location: ${scopeCounts.location}`);
    console.log(`   Product: ${scopeCounts.product}`);

  } catch (error) {
    console.error('❌ Error seeding system tags:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  seedSystemTags()
    .then(() => {
      console.log('\n✨ Seed complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Seed failed:', error);
      process.exit(1);
    });
}

export { seedSystemTags };

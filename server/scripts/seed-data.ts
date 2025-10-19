#!/usr/bin/env tsx

/**
 * Seed Data Script - PostgreSQL + Drizzle
 * 
 * This script will populate the database with:
 * 1. Categories from RentalZen
 * 2. Two customers with two homes each
 * 3. Room structure as specified
 * 4. Sample products, SKUs, and inventory for testing
 * 
 * Run with: tsx scripts/seed-data.ts
 */

import { db } from '../src/db/index.js';
import { hashPassword } from '../src/auth/index.js';
import * as schema from '@postgress/shared';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// ============================================
// SEED DATA DEFINITIONS
// ============================================

// Categories from RentalZen
const categoriesData = [
  // Top-level Categories
  { name: 'Electronics', slug: 'electronics', parentId: null },
  { name: 'Appliances', slug: 'appliances', parentId: null },
  { name: 'Linens', slug: 'linens', parentId: null },
  { name: 'Kitchenware', slug: 'kitchenware', parentId: null },
  { name: 'Fixtures', slug: 'fixtures', parentId: null },
  { name: 'Supplies', slug: 'supplies', parentId: null },
  
  // Sub-categories (parentId will be resolved after parent insertion)
  { name: 'Televisions', slug: 'tvs', parentSlug: 'electronics' },
  { name: 'AC Units', slug: 'ac-units', parentSlug: 'appliances' },
  { name: 'Lighting', slug: 'lighting', parentSlug: 'appliances' },
  { name: 'Small Kitchen Appliances', slug: 'small-kitchen-appliances', parentSlug: 'appliances' },
  { name: 'Bedding', slug: 'bedding', parentSlug: 'linens' },
  { name: 'Bath', slug: 'bath', parentSlug: 'linens' },
  { name: 'Dining', slug: 'dining', parentSlug: 'kitchenware' },
  { name: 'Fans', slug: 'fans', parentSlug: 'fixtures' },
  { name: 'Toiletries', slug: 'toiletries', parentSlug: 'supplies' },
  { name: 'Computer Components', slug: 'computer-components', parentSlug: 'electronics' },
];

// Customers
const customersData = [
  {
    name: 'Demo Customer 1',
    slug: 'demo-customer-1',
    email: 'demo1@example.com',
    subscriptionStatus: 'active' as const,
    maxHomes: 10
  },
  {
    name: 'Demo Customer 2', 
    slug: 'demo-customer-2',
    email: 'demo2@example.com',
    subscriptionStatus: 'active' as const,
    maxHomes: 5
  }
];

// Users for each customer
const usersData = [
  // Customer 1 users
  {
    customerSlug: 'demo-customer-1',
    email: 'admin1@example.com',
    name: 'Admin User 1',
    role: 'admin' as const,
    passwordHash: '$2a$10$dummy.hash.for.demo.user.1' // Dummy hash for demo
  },
  {
    customerSlug: 'demo-customer-1',
    email: 'manager1@example.com', 
    name: 'Manager User 1',
    role: 'manager' as const,
    passwordHash: '$2a$10$dummy.hash.for.demo.manager.1'
  },
  
  // Customer 2 users  
  {
    customerSlug: 'demo-customer-2',
    email: 'admin2@example.com',
    name: 'Admin User 2', 
    role: 'admin' as const,
    passwordHash: '$2a$10$dummy.hash.for.demo.user.2'
  },
  
  // Your authenticated user (replace with your actual auth email)
  {
    customerSlug: 'demo-customer-1', // Assign to customer 1
  email: 'john.doe@kavan.us', // Dev login user
  name: 'John Doe',
    role: 'admin' as const,
  passwordHash: ''
  }
];

// Homes for each customer
const homesData = [
  // Customer 1 homes
  {
    customerSlug: 'demo-customer-1',
    name: 'Primary Residence',
    slug: 'primary-residence',
    propertyType: 'single-family',
    bedrooms: 7,
    bathrooms: 6.5,
    squareFootage: 4500
  },
  {
    customerSlug: 'demo-customer-1', 
    name: 'Vacation Home',
    slug: 'vacation-home',
    propertyType: 'vacation-rental',
    bedrooms: 7,
    bathrooms: 6.5,
    squareFootage: 3800
  },
  // Customer 2 homes  
  {
    customerSlug: 'demo-customer-2',
    name: 'Main House',
    slug: 'main-house',
    propertyType: 'single-family',
    bedrooms: 5,
    bathrooms: 4.5,
    squareFootage: 2800
  },
  {
    customerSlug: 'demo-customer-2',
    name: 'Guest House', 
    slug: 'guest-house',
    propertyType: 'guest-house',
    bedrooms: 5,
    bathrooms: 4.5,
    squareFootage: 2200
  }
];

// Room structure function
function generateRoomStructure(customerSlug: string): any[] {
  const isCustomer2 = customerSlug === 'demo-customer-2';
  const maxBedroom = isCustomer2 ? 5 : 7;
  
  const rooms = [
    // Master Suite
    { name: 'Master Bedroom', slug: 'master-bedroom', locationType: 'Bedroom', parentSlug: null },
    { name: 'Master Bathroom', slug: 'master-bathroom', locationType: 'Bathroom', parentSlug: 'master-bedroom' },
  ];
  
  // Guest bedrooms with ensuites (2-5)
  for (let i = 2; i <= (isCustomer2 ? 5 : 5); i++) {
    rooms.push(
      { name: `Bedroom ${i}`, slug: `bedroom-${i}`, locationType: 'Bedroom', parentSlug: null },
      { name: `Bathroom ${i}`, slug: `bathroom-${i}`, locationType: 'Bathroom', parentSlug: `bedroom-${i}` }
    );
  }
  
  // Additional bedrooms without ensuites (6-7 for customer 1 only)
  if (!isCustomer2) {
    for (let i = 6; i <= maxBedroom; i++) {
      rooms.push(
        { name: `Bedroom ${i}`, slug: `bedroom-${i}`, locationType: 'Bedroom', parentSlug: null }
      );
    }
  }
  
  return rooms;
}

// Sample brands and vendors
const brandsData = [
  { name: 'Samsung', slug: 'samsung', websiteUrl: 'https://samsung.com' },
  { name: 'TCL', slug: 'tcl', websiteUrl: 'https://tcl.com' },
  { name: 'Pottery Barn', slug: 'pottery-barn', websiteUrl: 'https://potterybarn.com' },
  { name: 'IKEA', slug: 'ikea', websiteUrl: 'https://ikea.com' }
];

const vendorsData = [
  { name: 'Best Buy', slug: 'best-buy', websiteUrl: 'https://bestbuy.com' },
  { name: 'Amazon', slug: 'amazon', websiteUrl: 'https://amazon.com' },
  { name: 'Pottery Barn', slug: 'pottery-barn-vendor', websiteUrl: 'https://potterybarn.com' },
  { name: 'IKEA', slug: 'ikea-vendor', websiteUrl: 'https://ikea.com' }
];

// Sample tags
const tagsData = [
  { name: 'Smart Device', slug: 'smart-device', color: '#3B82F6' },
  { name: 'High Priority', slug: 'high-priority', color: '#EF4444' },
  { name: 'Warranty', slug: 'warranty', color: '#10B981' },
  { name: 'Organic', slug: 'organic', color: '#84CC16' }
];

// Sample products (will be created for each home)
const sampleProductsData = [
  // Electronics
  {
    name: '55" Smart TV',
    slug: '55-smart-tv',
    categorySlug: 'tvs',
    kind: 'simple',
    notes: 'Main living room television'
  },
  {
    name: '75" Smart TV',
    slug: '75-smart-tv',
    categorySlug: 'tvs',
    kind: 'simple',
    notes: 'Master bedroom television'
  },
  {
    name: 'Sound System',
    slug: 'sound-system',
    categorySlug: 'electronics',
    kind: 'bom',
    notes: 'Complete home theater audio system'
  },
  
  // Appliances
  {
    name: 'Coffee Maker',
    slug: 'coffee-maker',
    categorySlug: 'small-kitchen-appliances',
    kind: 'simple',
    notes: 'Morning coffee essentials'
  },
  {
    name: 'Blender',
    slug: 'blender',
    categorySlug: 'small-kitchen-appliances',
    kind: 'simple',
    notes: 'High-performance blender'
  },
  {
    name: '12000 BTU AC Unit',
    slug: '12000-btu-ac',
    categorySlug: 'ac-units',
    kind: 'simple',
    notes: 'Bedroom air conditioning'
  },
  {
    name: '24000 BTU AC Unit',
    slug: '24000-btu-ac',
    categorySlug: 'ac-units',
    kind: 'simple',
    notes: 'Living room air conditioning'
  },
  
  // Linens - Kits
  {
    name: 'King Linen Set',
    slug: 'king-linen-set',
    categorySlug: 'bedding',
    kind: 'bom',
    notes: 'Complete bedding set for master bedroom'
  },
  {
    name: 'Queen Linen Set',
    slug: 'queen-linen-set',
    categorySlug: 'bedding',
    kind: 'bom',
    notes: 'Complete bedding set for guest bedrooms'
  },
  {
    name: 'Bath Towel Set',
    slug: 'bath-towel-set',
    categorySlug: 'bath',
    kind: 'bom',
    notes: 'Complete bathroom towel set'
  },
  
  // Individual Linen Components
  {
    name: 'King Flat Sheet',
    slug: 'king-flat-sheet',
    categorySlug: 'bedding',
    kind: 'simple',
    notes: 'Individual king flat sheet'
  },
  {
    name: 'King Fitted Sheet',
    slug: 'king-fitted-sheet',
    categorySlug: 'bedding',
    kind: 'simple',
    notes: 'Individual king fitted sheet'
  },
  {
    name: 'King Pillowcase',
    slug: 'king-pillowcase',
    categorySlug: 'bedding',
    kind: 'simple',
    notes: 'Individual king pillowcase'
  },
  {
    name: 'Bath Towel',
    slug: 'bath-towel',
    categorySlug: 'bath',
    kind: 'simple',
    notes: 'Individual bath towel'
  },
  {
    name: 'Hand Towel',
    slug: 'hand-towel',
    categorySlug: 'bath',
    kind: 'simple',
    notes: 'Individual hand towel'
  },
  {
    name: 'Washcloth',
    slug: 'washcloth',
    categorySlug: 'bath',
    kind: 'simple',
    notes: 'Individual washcloth'
  },
  
  // Lighting & Fixtures
  {
    name: 'Bedside Lamp',
    slug: 'bedside-lamp',
    categorySlug: 'lighting',
    kind: 'simple',
    notes: 'Reading lamp for bedrooms'
  },
  {
    name: 'Ceiling Fan',
    slug: 'ceiling-fan',
    categorySlug: 'fans',
    kind: 'simple',
    notes: 'Bedroom ceiling fan'
  },
  
  // Kitchenware
  {
    name: 'Dinner Plate Set',
    slug: 'dinner-plate-set',
    categorySlug: 'dining',
    kind: 'bom',
    notes: 'Complete dinner service for 8'
  },
  {
    name: 'Dinner Plate',
    slug: 'dinner-plate',
    categorySlug: 'dining',
    kind: 'simple',
    notes: 'Individual dinner plate'
  },
  {
    name: 'Salad Plate',
    slug: 'salad-plate',
    categorySlug: 'dining',
    kind: 'simple',
    notes: 'Individual salad plate'
  }
];

// SKUs for products - ensuring 20+ SKUs with kit relationships
const sampleSkusData = [
  // TVs
  {
    productSlug: '55-smart-tv',
    slug: 'SAM-55-Q70C',
    name: 'Samsung 55" Q70C QLED TV',
    brandSlug: 'samsung',
    vendorSlug: 'best-buy',
    kind: 'simple' as const,
    price: '799.99'
  },
  {
    productSlug: '75-smart-tv',
    slug: 'SAM-75-Q70C',
    name: 'Samsung 75" Q70C QLED TV',
    brandSlug: 'samsung',
    vendorSlug: 'best-buy',
    kind: 'simple' as const,
    price: '1299.99'
  },
  
  // Sound System Kit
  {
    productSlug: 'sound-system',
    slug: 'SONY-HT-A7000',
    name: 'Sony HT-A7000 Sound System Kit',
    brandSlug: 'samsung', // Using Samsung as placeholder
    vendorSlug: 'best-buy',
    kind: 'kit' as const,
    price: '899.99'
  },
  
  // Appliances
  {
    productSlug: 'coffee-maker',
    slug: 'KEURIG-K-CLASSIC',
    name: 'Keurig K-Classic Coffee Maker',
    brandSlug: 'samsung',
    vendorSlug: 'amazon',
    kind: 'simple' as const,
    price: '89.99'
  },
  {
    productSlug: 'blender',
    slug: 'VITA-5200',
    name: 'Vitamix 5200 Blender',
    brandSlug: 'samsung',
    vendorSlug: 'amazon',
    kind: 'simple' as const,
    price: '349.99'
  },
  {
    productSlug: '12000-btu-ac',
    slug: 'FRIG-12K-AC',
    name: 'Frigidaire 12,000 BTU Window AC',
    brandSlug: 'samsung',
    vendorSlug: 'best-buy',
    kind: 'simple' as const,
    price: '329.99'
  },
  {
    productSlug: '24000-btu-ac',
    slug: 'FRIG-24K-AC',
    name: 'Frigidaire 24,000 BTU Window AC',
    brandSlug: 'samsung',
    vendorSlug: 'best-buy',
    kind: 'simple' as const,
    price: '549.99'
  },
  
  // King Linen Set Kit
  {
    productSlug: 'king-linen-set',
    slug: 'PB-KING-SET-WHT',
    name: 'Pottery Barn King Linen Set - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'kit' as const,
    price: '299.99'
  },
  
  // Queen Linen Set Kit
  {
    productSlug: 'queen-linen-set',
    slug: 'PB-QUEEN-SET-WHT',
    name: 'Pottery Barn Queen Linen Set - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'kit' as const,
    price: '249.99'
  },
  
  // Bath Towel Set Kit
  {
    productSlug: 'bath-towel-set',
    slug: 'PB-TOWEL-SET-WHT',
    name: 'Pottery Barn Bath Towel Set - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'kit' as const,
    price: '159.99'
  },
  
  // Individual Linen Components
  {
    productSlug: 'king-flat-sheet',
    slug: 'PB-KING-FLAT-WHT',
    name: 'Pottery Barn King Flat Sheet - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '89.99'
  },
  {
    productSlug: 'king-fitted-sheet',
    slug: 'PB-KING-FITTED-WHT',
    name: 'Pottery Barn King Fitted Sheet - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '89.99'
  },
  {
    productSlug: 'king-pillowcase',
    slug: 'PB-KING-PILLOW-WHT',
    name: 'Pottery Barn King Pillowcase - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '29.99'
  },
  {
    productSlug: 'bath-towel',
    slug: 'PB-BATH-TOWEL-WHT',
    name: 'Pottery Barn Bath Towel - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '39.99'
  },
  {
    productSlug: 'hand-towel',
    slug: 'PB-HAND-TOWEL-WHT',
    name: 'Pottery Barn Hand Towel - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '24.99'
  },
  {
    productSlug: 'washcloth',
    slug: 'PB-WASHCLOTH-WHT',
    name: 'Pottery Barn Washcloth - White',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '12.99'
  },
  
  // Lighting
  {
    productSlug: 'bedside-lamp',
    slug: 'IKEA-LAMPAN-WHT',
    name: 'IKEA Lampan Table Lamp - White',
    brandSlug: 'ikea',
    vendorSlug: 'ikea-vendor',
    kind: 'simple' as const,
    price: '14.99'
  },
  {
    productSlug: 'ceiling-fan',
    slug: 'HUNTER-PROS-52',
    name: 'Hunter Pro Series 52" Ceiling Fan',
    brandSlug: 'samsung',
    vendorSlug: 'amazon',
    kind: 'simple' as const,
    price: '179.99'
  },
  
  // Dinnerware Kit
  {
    productSlug: 'dinner-plate-set',
    slug: 'PB-DINNER-SET-8',
    name: 'Pottery Barn Dinner Plate Set - Service for 8',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'kit' as const,
    price: '199.99'
  },
  
  // Individual Dinnerware Components
  {
    productSlug: 'dinner-plate',
    slug: 'PB-DINNER-PLATE',
    name: 'Pottery Barn Dinner Plate',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '18.99'
  },
  {
    productSlug: 'salad-plate',
    slug: 'PB-SALAD-PLATE',
    name: 'Pottery Barn Salad Plate',
    brandSlug: 'pottery-barn',
    vendorSlug: 'pottery-barn-vendor',
    kind: 'simple' as const,
    price: '14.99'
  }
];

// Kit component relationships
const kitComponents = [
  // King Linen Set components
  {
    kitslug: 'PB-KING-SET-WHT',
    componentslug: 'PB-KING-FLAT-WHT',
    quantity: 1
  },
  {
    kitslug: 'PB-KING-SET-WHT',
    componentslug: 'PB-KING-FITTED-WHT',
    quantity: 1
  },
  {
    kitslug: 'PB-KING-SET-WHT',
    componentslug: 'PB-KING-PILLOW-WHT',
    quantity: 2
  },
  
  // Queen Linen Set components (using king components as placeholders)
  {
    kitslug: 'PB-QUEEN-SET-WHT',
    componentslug: 'PB-KING-FLAT-WHT', // Would be queen in real data
    quantity: 1
  },
  {
    kitslug: 'PB-QUEEN-SET-WHT',
    componentslug: 'PB-KING-FITTED-WHT', // Would be queen in real data
    quantity: 1
  },
  {
    kitslug: 'PB-QUEEN-SET-WHT',
    componentslug: 'PB-KING-PILLOW-WHT', // Would be queen in real data
    quantity: 2
  },
  
  // Bath Towel Set components
  {
    kitslug: 'PB-TOWEL-SET-WHT',
    componentslug: 'PB-BATH-TOWEL-WHT',
    quantity: 4
  },
  {
    kitslug: 'PB-TOWEL-SET-WHT',
    componentslug: 'PB-HAND-TOWEL-WHT',
    quantity: 4
  },
  {
    kitslug: 'PB-TOWEL-SET-WHT',
    componentslug: 'PB-WASHCLOTH-WHT',
    quantity: 8
  },
  
  // Dinner Plate Set components
  {
    kitslug: 'PB-DINNER-SET-8',
    componentslug: 'PB-DINNER-PLATE',
    quantity: 8
  },
  {
    kitslug: 'PB-DINNER-SET-8',
    componentslug: 'PB-SALAD-PLATE',
    quantity: 8
  }
];

// Product component relationships (product-level kit structure)
// This allows a product to be fulfilled by EITHER a kit SKU OR individual component SKUs
const productComponents = [
  // King Linen Set product components
  {
    kitProductSlug: 'king-linen-set',
    componentProductSlug: 'king-flat-sheet',
    quantity: 1,
    isRequired: true
  },
  {
    kitProductSlug: 'king-linen-set',
    componentProductSlug: 'king-fitted-sheet', 
    quantity: 1,
    isRequired: true
  },
  {
    kitProductSlug: 'king-linen-set',
    componentProductSlug: 'king-pillowcase',
    quantity: 2,
    isRequired: true
  },
  
  // Queen Linen Set product components
  {
    kitProductSlug: 'queen-linen-set',
    componentProductSlug: 'king-flat-sheet', // Would be queen products in real data
    quantity: 1,
    isRequired: true
  },
  {
    kitProductSlug: 'queen-linen-set',
    componentProductSlug: 'king-fitted-sheet',
    quantity: 1, 
    isRequired: true
  },
  {
    kitProductSlug: 'queen-linen-set',
    componentProductSlug: 'king-pillowcase',
    quantity: 2,
    isRequired: true
  },
  
  // Bath Towel Set product components
  {
    kitProductSlug: 'bath-towel-set',
    componentProductSlug: 'bath-towel',
    quantity: 4,
    isRequired: true
  },
  {
    kitProductSlug: 'bath-towel-set',
    componentProductSlug: 'hand-towel',
    quantity: 4,
    isRequired: true
  },
  {
    kitProductSlug: 'bath-towel-set',
    componentProductSlug: 'washcloth',
    quantity: 8,
    isRequired: true
  },
  
  // Dinner Plate Set product components
  {
    kitProductSlug: 'dinner-plate-set',
    componentProductSlug: 'dinner-plate',
    quantity: 8,
    isRequired: true
  },
  {
    kitProductSlug: 'dinner-plate-set',
    componentProductSlug: 'salad-plate', 
    quantity: 8,
    isRequired: true
  }
];

// ============================================
// SEEDING FUNCTIONS
// ============================================

async function seedUsers(customers: any[]) {
  log('\n👤 SEEDING USERS...', colors.blue + colors.bold);
  
  const insertedUsers: any[] = [];
  const customerMap = new Map(customers.map(c => [c.slug, c]));
  
  for (const userData of usersData) {
    const customer = customerMap.get(userData.customerSlug);
    
    log(`  ✅ Creating user: ${userData.name} (${userData.role}) for ${customer.name}`, colors.green);
    
    const [firstName, ...rest] = (userData.name || '').split(' ');
    const lastName = rest.join(' ') || '';

  // Use a real bcrypt hash so credentials login works. Default password: Passw0rd!
  const pwdHash = await hashPassword('Passw0rd!');

    const [user] = await db.insert(schema.users)
      .values({
        customer_id: customer.id,
        email: userData.email,
        first_name: firstName || userData.name,
        last_name: lastName || userData.name,
    password_hash: pwdHash,
        role: userData.role
      })
      .returning();
      
    insertedUsers.push({ ...user, customerSlug: userData.customerSlug });
  }
  
  log(`✅ Created ${insertedUsers.length} users`, colors.green);
  return insertedUsers;
}

async function seedUserHomeAccess(users: any[], homes: any[]) {
  log('\n🔑 SEEDING USER HOME ACCESS...', colors.blue + colors.bold);
  
  const insertedAccess: any[] = [];
  
  for (const user of users) {
    // Give each user access to all homes of their customer
    const customerHomes = homes.filter(home => home.customerSlug === user.customerSlug);
    
    for (const home of customerHomes) {
      const accessRole = user.role === 'admin' ? 'admin' : (user.role === 'manager' ? 'manager' : 'viewer');
      
      log(`  ✅ Granting ${accessRole} access: ${user.name} → ${home.name}`, colors.green);
      
      const [access] = await db.insert(schema.userHomeAccess)
        .values({
          userId: user.id,
          homeId: home.id,
          role: accessRole
        })
        .returning();
        
      insertedAccess.push(access);
    }
  }
  
  log(`✅ Created ${insertedAccess.length} user home access records`, colors.green);
  return insertedAccess;
}

async function seedProductComponents(products: any[], productMap: Map<string, any>) {
  log('\n🔗 SEEDING PRODUCT COMPONENTS (PRODUCT-LEVEL KIT RELATIONSHIPS)...', colors.blue + colors.bold);
  
  const insertedComponents: any[] = [];
  
  for (const component of productComponents) {
    // Find products across all homes
    const kitProducts = Array.from(productMap.values()).filter(p => p.slug === component.kitProductSlug);
    const componentProducts = Array.from(productMap.values()).filter(p => p.slug === component.componentProductSlug);
    
    // Create component relationships for each kit product instance
    for (const kitProduct of kitProducts) {
      // Find the corresponding component product in the same home
      const componentProduct = componentProducts.find(cp => cp.homeId === kitProduct.homeId);
      
      if (componentProduct) {
        log(`  ✅ Adding product component: ${componentProduct.name} (${component.quantity}x) to kit ${kitProduct.name}`, colors.green);
        
        const [productComponent] = await db.insert(schema.productComponents)
          .values({
            parentProductId: kitProduct.id,
            componentProductId: componentProduct.id,
            quantity: component.quantity,
            isRequired: component.isRequired
          })
          .returning();
          
        insertedComponents.push(productComponent);
      }
    }
  }
  
  log(`✅ Created ${insertedComponents.length} product component relationships`, colors.green);
  return insertedComponents;
}

async function seedCustomers() {
  log('\n👥 SEEDING CUSTOMERS...', colors.blue + colors.bold);
  
  const insertedCustomers: any[] = [];
  
  for (const customerData of customersData) {
    log(`  ✅ Creating customer: ${customerData.name}`, colors.green);
    
    const [customer] = await db.insert(schema.customers)
      .values(customerData)
      .returning();
      
    insertedCustomers.push(customer);
  }
  
  log(`✅ Created ${insertedCustomers.length} customers`, colors.green);
  return insertedCustomers;
}

async function seedCategories(customers: any[]) {
  log('\n📂 SEEDING CATEGORIES...', colors.blue + colors.bold);
  
  const insertedCategories: any[] = [];
  const categoryMap = new Map();
  
  // First pass: Insert top-level categories
  for (const categoryData of categoriesData.filter(cat => !cat.parentSlug)) {
    for (const customer of customers) {
      log(`  ✅ Creating category: ${categoryData.name} for ${customer.name}`, colors.green);
      
      const [category] = await db.insert(schema.categories)
        .values({
          customerId: customer.id,
          name: categoryData.name,
          slug: categoryData.slug,
          parentId: null
        })
        .returning();
        
      insertedCategories.push(category);
      categoryMap.set(`${customer.id}-${categoryData.slug}`, category);
    }
  }
  
  // Second pass: Insert sub-categories with parent references
  for (const categoryData of categoriesData.filter(cat => cat.parentSlug)) {
    for (const customer of customers) {
      const parentCategory = categoryMap.get(`${customer.id}-${categoryData.parentSlug}`);
      
      log(`  ✅ Creating subcategory: ${categoryData.name} under ${parentCategory.name}`, colors.green);
      
      const [category] = await db.insert(schema.categories)
        .values({
          customerId: customer.id,
          name: categoryData.name,
          slug: categoryData.slug,
          parentId: parentCategory.id
        })
        .returning();
        
      insertedCategories.push(category);
      categoryMap.set(`${customer.id}-${categoryData.slug}`, category);
    }
  }
  
  log(`✅ Created ${insertedCategories.length} categories`, colors.green);
  return { categories: insertedCategories, categoryMap };
}

async function seedHomes(customers: any[]) {
  log('\n🏠 SEEDING HOMES...', colors.blue + colors.bold);
  
  const insertedHomes: any[] = [];
  const customerMap = new Map(customers.map(c => [c.slug, c]));
  
  for (const homeData of homesData) {
    const customer = customerMap.get(homeData.customerSlug);
    
    log(`  ✅ Creating home: ${homeData.name} for ${customer.name}`, colors.green);
    
    const [home] = await db.insert(schema.homes)
      .values({
        customerId: customer.id,
        name: homeData.name,
        slug: homeData.slug,
        propertyType: homeData.propertyType,
        bedrooms: homeData.bedrooms,
        bathrooms: homeData.bathrooms.toString(),
        squareFootage: homeData.squareFootage
      })
      .returning();
      
    insertedHomes.push({ ...home, customerSlug: homeData.customerSlug });
  }
  
  log(`✅ Created ${insertedHomes.length} homes`, colors.green);
  return insertedHomes;
}

async function seedBrandsAndVendors(customers: any[]) {
  log('\n🏢 SEEDING BRANDS AND VENDORS...', colors.blue + colors.bold);
  
  const insertedBrands: any[] = [];
  const insertedVendors: any[] = [];
  const brandMap = new Map();
  const vendorMap = new Map();
  
  // Seed brands for each customer
  for (const customer of customers) {
    for (const brandData of brandsData) {
      log(`  ✅ Creating brand: ${brandData.name} for ${customer.name}`, colors.green);
      
      const [brand] = await db.insert(schema.brands)
        .values({
          customerId: customer.id,
          name: brandData.name,
          slug: brandData.slug,
          websiteUrl: brandData.websiteUrl
        })
        .returning();
        
      insertedBrands.push(brand);
      brandMap.set(`${customer.id}-${brandData.slug}`, brand);
    }
    
    for (const vendorData of vendorsData) {
      log(`  ✅ Creating vendor: ${vendorData.name} for ${customer.name}`, colors.green);
      
      const [vendor] = await db.insert(schema.vendors)
        .values({
          customerId: customer.id,
          name: vendorData.name,
          slug: vendorData.slug,
          websiteUrl: vendorData.websiteUrl
        })
        .returning();
        
      insertedVendors.push(vendor);
      vendorMap.set(`${customer.id}-${vendorData.slug}`, vendor);
    }
  }
  
  log(`✅ Created ${insertedBrands.length} brands and ${insertedVendors.length} vendors`, colors.green);
  return { brands: insertedBrands, vendors: insertedVendors, brandMap, vendorMap };
}

async function seedTags(customers: any[]) {
  log('\n🏷️  SEEDING TAGS...', colors.blue + colors.bold);
  
  const insertedTags: any[] = [];
  
  for (const customer of customers) {
    for (const tagData of tagsData) {
      log(`  ✅ Creating tag: ${tagData.name} for ${customer.name}`, colors.green);
      
      const [tag] = await db.insert(schema.tags)
        .values({
          customerId: customer.id,
          name: tagData.name,
          slug: tagData.slug,
          color: tagData.color
        })
        .returning();
        
      insertedTags.push(tag);
    }
  }
  
  log(`✅ Created ${insertedTags.length} tags`, colors.green);
  return insertedTags;
}

async function seedLocations(homes: any[]) {
  log('\n📍 SEEDING LOCATIONS (ROOMS)...', colors.blue + colors.bold);
  
  const insertedLocations: any[] = [];
  const locationMap = new Map();
  
  for (const home of homes) {
    const roomStructure = generateRoomStructure(home.customerSlug);
    
    log(`  🏠 Creating rooms for ${home.name}:`, colors.cyan);
    
    // First pass: Create parent rooms
    for (const roomData of roomStructure.filter(room => !room.parentSlug)) {
      log(`    ✅ Creating room: ${roomData.name}`, colors.green);
      
      const [location] = await db.insert(schema.locations)
        .values({
          homeId: home.id,
          name: roomData.name,
          slug: roomData.slug,
          locationType: roomData.locationType
        })
        .returning();
        
      insertedLocations.push(location);
      locationMap.set(`${home.id}-${roomData.slug}`, location);
    }
    
  // Second pass: Create child rooms (bathrooms)
    for (const roomData of roomStructure.filter(room => room.parentSlug)) {
      const parentLocation = locationMap.get(`${home.id}-${roomData.parentSlug}`);
      
      log(`    ✅ Creating child room: ${roomData.name} (child of ${parentLocation.name})`, colors.green);
      
      const [location] = await db.insert(schema.locations)
        .values({
          homeId: home.id,
          name: roomData.name,
          slug: roomData.slug,
          locationType: roomData.locationType,
      parentId: parentLocation.id,
          description: `Ensuite bathroom for ${parentLocation.name}`
        })
        .returning();
        
      insertedLocations.push(location);
      locationMap.set(`${home.id}-${roomData.slug}`, location);
    }
  }
  
  log(`✅ Created ${insertedLocations.length} locations`, colors.green);
  return { locations: insertedLocations, locationMap };
}

async function seedProducts(homes: any[], categoryMap: Map<string, any>) {
  log('\n📦 SEEDING PRODUCTS...', colors.blue + colors.bold);
  
  const insertedProducts: any[] = [];
  const productMap = new Map();
  
  for (const home of homes) {
    for (const productData of sampleProductsData) {
      const category = categoryMap.get(`${home.customerId}-${productData.categorySlug}`);
      
      log(`  ✅ Creating product: ${productData.name} for ${home.name}`, colors.green);
      
      const [product] = await db.insert(schema.products)
        .values({
          homeId: home.id,
          name: productData.name,
          slug: productData.slug,
          categoryId: category.id,
          kind: productData.kind,
          notes: productData.notes
        })
        .returning();
        
      insertedProducts.push({ ...product, homeSlug: home.slug, customerSlug: home.customerSlug, customerId: home.customerId });
      productMap.set(`${home.id}-${productData.slug}`, product);
    }
  }
  
  log(`✅ Created ${insertedProducts.length} products`, colors.green);
  return { products: insertedProducts, productMap };
}

async function seedSkus(products: any[], brandMap: Map<string, any>, vendorMap: Map<string, any>) {
  log('\n🏷️  SEEDING SKUS...', colors.blue + colors.bold);
  
  const insertedSkus: any[] = [];
  const skuMap = new Map();
  const createdSkuCodes = new Set(); // Track created SKU codes per customer
  
  for (const product of products) {
    for (const skuData of sampleSkusData) {
      if (skuData.productSlug === product.slug) {
        const skuKey = `${product.customerId}-${skuData.skuCode}`;
        
        // Skip if this SKU code already exists for this customer
        if (createdSkuCodes.has(skuKey)) {
          log(`  ⚠️  Skipping duplicate SKU: ${skuData.skuCode} for customer ${product.customerId}`, colors.yellow);
          continue;
        }
        
        const brandKey = `${product.customerId}-${skuData.brandSlug}`;
        const vendorKey = `${product.customerId}-${skuData.vendorSlug}`;
        const brand = brandMap.get(brandKey);
        const vendor = vendorMap.get(vendorKey);
        
        if (!brand) {
          log(`  ❌ Brand not found for key: ${brandKey} (available: ${Array.from(brandMap.keys()).join(', ')})`, colors.red);
          continue;
        }
        if (!vendor) {
          log(`  ❌ Vendor not found for key: ${vendorKey} (available: ${Array.from(vendorMap.keys()).join(', ')})`, colors.red);
          continue;
        }
        
        log(`  ✅ Creating SKU: ${skuData.name} for ${product.name}`, colors.green);
        
        const [sku] = await db.insert(schema.skus)
          .values({
            customerId: product.customerId,
            productId: product.id,
            slug: skuData.skuCode,
            name: skuData.name,
            brandId: brand.id,
            vendorId: vendor.id,
            kind: skuData.kind,
            price: skuData.price,
            currency: 'USD',
            isPurchasable: true
          })
          .returning();
          
        insertedSkus.push({ ...sku, productSlug: product.slug, homeSlug: product.homeSlug });
        skuMap.set(`${product.id}-${skuData.skuCode}`, sku);
        createdSkuCodes.add(skuKey); // Track this SKU code as created
      }
    }
  }
  
  log(`✅ Created ${insertedSkus.length} SKUs`, colors.green);
  return { skus: insertedSkus, skuMap };
}

async function seedSkuComponents(skus: any[], skuMap: Map<string, any>) {
  log('\n🔗 SEEDING SKU COMPONENTS (KIT RELATIONSHIPS)...', colors.blue + colors.bold);
  
  const insertedComponents: any[] = [];
  
  for (const component of kitComponents) {
    // Find the kit SKU and component SKU
    const kitSku = Array.from(skuMap.values()).find(sku => sku.skuCode === component.kitSkuCode);
    const componentSku = Array.from(skuMap.values()).find(sku => sku.skuCode === component.componentSkuCode);
    
    if (kitSku && componentSku) {
      log(`  ✅ Adding component: ${componentSku.name} (${component.quantity}x) to kit ${kitSku.name}`, colors.green);
      
      const [skuComponent] = await db.insert(schema.skuComponents)
        .values({
          parentSkuId: kitSku.id,
          componentSkuId: componentSku.id,
          quantity: component.quantity,
          isRequired: true
        })
        .returning();
        
      insertedComponents.push(skuComponent);
    }
  }
  
  log(`✅ Created ${insertedComponents.length} SKU component relationships`, colors.green);
  return insertedComponents;
}

async function seedInventoryItems(products: any[], skus: any[], locationMap: Map<string, any>) {
  log('\n📋 SEEDING INVENTORY ITEMS (20+ ITEMS INCLUDING KITS)...', colors.blue + colors.bold);
  
  const insertedInventoryItems: any[] = [];
  
  for (const product of products) {
    const productSkus = skus.filter(sku => sku.productId === product.id);
    
    for (const sku of productSkus) {
      // Get locations for this home
      const homeLocations = Array.from(locationMap.values()).filter(loc => loc.homeId === product.homeId);
      
      // For kits, create fewer inventory items but mark them as kits
      // For simple items, create multiple items in different locations
      const isBom = sku.kind === 'bom';
      const inventoryCount = isBom ? 1 : Math.min(3, homeLocations.length);
      
      for (let i = 0; i < inventoryCount; i++) {
        const location = homeLocations[i % homeLocations.length];
        
        const status = i === 0 ? 'in_use' : 'in_storage';
        const condition = i === 0 ? 'excellent' : (i === 1 ? 'good' : 'fair');
        
        log(`  ✅ Creating inventory item: ${sku.name} in ${location.name} ${isBom ? '(BOM)' : ''}`, colors.green);
        
    const [inventoryItem] = await db.insert(schema.inventoryItems)
          .values({
            customerId: product.customerId,
            homeId: product.homeId,
            skuId: sku.id,
            productId: product.id,
            locationId: location.id,
            status: status,
            condition: condition,
            quantity: isBom ? 1 : 1,
      purchasePrice: sku.price,
      currency: 'USD',
            assetTag: `${sku.skuCode}-${String(i + 1).padStart(3, '0')}`,
            notes: `${sku.name} located in ${location.name}${isBom ? ' - Complete BOM with all components' : ''}`
          })
          .returning();
          
        insertedInventoryItems.push(inventoryItem);
      }
    }
  }
  
  log(`✅ Created ${insertedInventoryItems.length} inventory items`, colors.green);
  return insertedInventoryItems;
}

// ============================================
// MAIN SEEDING FUNCTION
// ============================================

async function main() {
  try {
    log(`${colors.bold}${colors.magenta}🌱 SEED DATA SCRIPT${colors.reset}\n`);
    log(`Database: ${process.env.DATABASE_URL?.split('@')[1] || 'unknown'}`);
    log(`Time: ${new Date().toISOString()}\n`);
    
    // Step 1: Seed customers
    const customers = await seedCustomers();
    
    // Step 2: Seed categories from RentalZen
    const { categories, categoryMap } = await seedCategories(customers);
    
    // Step 3: Seed homes 
    const homes = await seedHomes(customers);
    
    // Step 4: Seed brands and vendors
    const { brands, vendors, brandMap, vendorMap } = await seedBrandsAndVendors(customers);
    
    // Step 5: Seed tags
    const tags = await seedTags(customers);
    
    // Step 6: Seed locations (rooms)
    const { locations, locationMap } = await seedLocations(homes);
    
    // Step 7: Seed products
    const { products, productMap } = await seedProducts(homes, categoryMap);
    
    // Step 8: Seed SKUs
    const { skus, skuMap } = await seedSkus(products, brandMap, vendorMap);
    
    // Step 9: Seed SKU components (kit relationships)
    const skuComponents = await seedSkuComponents(skus, skuMap);
    
    // Step 10: Seed inventory items
    const inventoryItems = await seedInventoryItems(products, skus, locationMap);
    
    // Step 11: Seed users
    const users = await seedUsers(customers);
    
    // Step 12: Seed user home access
    const userHomeAccess = await seedUserHomeAccess(users, homes);
    
    // Step 13: Seed product components (product-level kit relationships)
    const productComponentsResult = await seedProductComponents(products, productMap);
    
    // Summary
    log(`\n${colors.green}${colors.bold}🎉 SEEDING COMPLETE!${colors.reset}\n`);
    log(`📊 Summary:`);
    log(`  👥 Customers: ${customers.length}`);
    log(`  📂 Categories: ${categories.length}`);
    log(`  🏠 Homes: ${homes.length}`);
    log(`  🏢 Brands: ${brands.length}`);
    log(`  🛒 Vendors: ${vendors.length}`);
    log(`  🏷️  Tags: ${tags.length}`);
    log(`  📍 Locations: ${locations.length}`);
    log(`  📦 Products: ${products.length}`);
    log(`  🏷️  SKUs: ${skus.length}`);
    log(`  🔗 SKU Components: ${skuComponents.length}`);
    log(`  📋 Inventory Items: ${inventoryItems.length}`);
    log(`  👤 Users: ${users.length}`);
    log(`  🔑 User Home Access: ${userHomeAccess.length}`);
    log(`  🔗 Product Components: ${productComponentsResult.length}`);
    
    log(`\n✅ Database is ready for testing!`);
    
  } catch (error) {
    log(`\n${colors.red}${colors.bold}💥 SEEDING FAILED: ${error}${colors.reset}\n`);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
main();

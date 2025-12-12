/**
 * Export Media Assets Script
 * 
 * Exports images from media_assets table to a structured directory format.
 * 
 * Usage:
 *   npx tsx src/scripts/export-media.ts [--dry-run] [--customer-id=N] [--home-id=N]
 * 
 * Output structure:
 *   rootPath/pre-melissa/locations/{locationName}/
 *   rootPath/by_location/{locationName}/
 *   rootPath/by_category/{parentCategory}/{subCategory}/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Pool } from 'pg';
import { drizzle, eq, and } from '@postgress/shared';
import * as schema from '@postgress/shared';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const ROOT_PATH = process.env.MEDIA_EXPORT_PATH || 'S:\\melissa';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CUSTOMER_ID = (() => {
  const arg = args.find(a => a.startsWith('--customer-id='));
  return arg ? parseInt(arg.split('=')[1], 10) : undefined;
})();
const HOME_ID = (() => {
  const arg = args.find(a => a.startsWith('--home-id='));
  return arg ? parseInt(arg.split('=')[1], 10) : undefined;
})();

// Database setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

/**
 * Normalize a name for use as a Windows directory/file name
 */
function normalizeName(name: string | null | undefined): string {
  if (!name) return 'unknown';
  return name
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')    // Replace invalid Windows chars
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .replace(/\.+$/g, '')              // Remove trailing dots
    .replace(/-+/g, '-')               // Collapse multiple dashes
    .substring(0, 100);                // Limit length
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    if (!DRY_RUN) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}

/**
 * Copy file to destination
 */
async function copyFile(src: string, destDir: string, fileName: string): Promise<string> {
  await ensureDir(destDir);
  const destPath = path.join(destDir, fileName);
  
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would copy: ${src} -> ${destPath}`);
    return destPath;
  }
  
  try {
    await fs.copyFile(src, destPath);
    console.log(`  Copied: ${destPath}`);
    return destPath;
  } catch (err: any) {
    console.error(`  ERROR copying ${src}: ${err.message}`);
    throw err;
  }
}

/**
 * Get source file path for a media asset
 */
function getSourcePath(mediaUrl: string): string {
  return path.join(UPLOAD_DIR, mediaUrl);
}

/**
 * Generate export filename from media asset
 */
function getExportFileName(media: any, index: number): string {
  const sourceFile = media.fileName || media.url || '';
  const ext = path.extname(sourceFile).toLowerCase() || '.jpg';
  
  // Use original filename if available, otherwise title, otherwise generic
  let baseName: string;
  if (media.fileName) {
    // Remove extension from fileName to avoid duplication
    baseName = normalizeName(path.basename(media.fileName, path.extname(media.fileName)));
  } else if (media.title) {
    // Remove extension from title if present
    const titleExt = path.extname(media.title);
    baseName = titleExt 
      ? normalizeName(path.basename(media.title, titleExt))
      : normalizeName(media.title);
  } else {
    baseName = `image_${index}`;
  }
  
  return `${baseName}${ext}`;
}

// Cache for lookups to avoid repeated queries
const locationCache = new Map<number, { name: string }>();
const categoryCache = new Map<number, { id: number; name: string; parentId: number | null }>();
const inventoryItemCache = new Map<number, { locationId: number | null; productId: number; skuId: number }>();
const productCache = new Map<number, { name: string; categoryId: number | null }>();
const skuCache = new Map<number, { name: string }>();
const issueCache = new Map<number, { entityType: string; entityId: number; homeId: number | null }>();

/**
 * Look up location by ID
 */
async function getLocation(locationId: number): Promise<{ name: string } | null> {
  if (locationCache.has(locationId)) {
    return locationCache.get(locationId)!;
  }
  
  const rows = await db
    .select({ name: schema.locations.name })
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .limit(1);
  
  if (rows.length === 0) return null;
  locationCache.set(locationId, rows[0]);
  return rows[0];
}

/**
 * Look up category by ID (with parent)
 */
async function getCategory(categoryId: number): Promise<{ id: number; name: string; parentId: number | null } | null> {
  if (categoryCache.has(categoryId)) {
    return categoryCache.get(categoryId)!;
  }
  
  const rows = await db
    .select({ 
      id: schema.categories.id, 
      name: schema.categories.name, 
      parentId: schema.categories.parentId 
    })
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId))
    .limit(1);
  
  if (rows.length === 0) return null;
  categoryCache.set(categoryId, rows[0]);
  return rows[0];
}

/**
 * Get category path (parent/child names)
 */
async function getCategoryPath(categoryId: number | null): Promise<{ parent: string; child: string }> {
  if (!categoryId) return { parent: 'uncategorized', child: '' };
  
  const category = await getCategory(categoryId);
  if (!category) return { parent: 'uncategorized', child: '' };
  
  if (category.parentId) {
    const parent = await getCategory(category.parentId);
    return { 
      parent: normalizeName(parent?.name || 'unknown'), 
      child: normalizeName(category.name) 
    };
  }
  
  return { parent: normalizeName(category.name), child: '' };
}

/**
 * Look up inventory item
 */
async function getInventoryItem(itemId: number): Promise<{ locationId: number | null; productId: number; skuId: number } | null> {
  if (inventoryItemCache.has(itemId)) {
    return inventoryItemCache.get(itemId)!;
  }
  
  const rows = await db
    .select({ 
      locationId: schema.inventoryItems.locationId, 
      productId: schema.inventoryItems.productId,
      skuId: schema.inventoryItems.skuId 
    })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, itemId))
    .limit(1);
  
  if (rows.length === 0) return null;
  inventoryItemCache.set(itemId, rows[0]);
  return rows[0];
}

/**
 * Look up product
 */
async function getProduct(productId: number): Promise<{ name: string; categoryId: number | null } | null> {
  if (productCache.has(productId)) {
    return productCache.get(productId)!;
  }
  
  const rows = await db
    .select({ 
      name: schema.products.name, 
      categoryId: schema.products.categoryId 
    })
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .limit(1);
  
  if (rows.length === 0) return null;
  productCache.set(productId, rows[0]);
  return rows[0];
}

/**
 * Look up SKU
 */
async function getSku(skuId: number): Promise<{ name: string } | null> {
  if (skuCache.has(skuId)) {
    return skuCache.get(skuId)!;
  }
  
  const rows = await db
    .select({ name: schema.skus.name })
    .from(schema.skus)
    .where(eq(schema.skus.id, skuId))
    .limit(1);
  
  if (rows.length === 0) return null;
  skuCache.set(skuId, rows[0]);
  return rows[0];
}

/**
 * Look up issue
 */
async function getIssue(issueId: number): Promise<{ entityType: string; entityId: number; homeId: number | null } | null> {
  if (issueCache.has(issueId)) {
    return issueCache.get(issueId)!;
  }
  
  const rows = await db
    .select({ 
      entityType: schema.issues.entityType, 
      entityId: schema.issues.entityId,
      homeId: schema.issues.homeId 
    })
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);
  
  if (rows.length === 0) return null;
  issueCache.set(issueId, rows[0]);
  return rows[0];
}

interface ExportStats {
  total: number;
  locationExports: number;
  issueExports: number;
  skipped: number;
  errors: number;
}

/**
 * Export location media
 */
async function exportLocationMedia(media: any, index: number, stats: ExportStats): Promise<void> {
  const location = await getLocation(media.entityId);
  if (!location) {
    console.log(`  Skipping: Location ${media.entityId} not found`);
    stats.skipped++;
    return;
  }
  
  const locationName = normalizeName(location.name);
  const destDir = path.join(ROOT_PATH, 'pre-melissa', 'locations', locationName);
  const srcPath = getSourcePath(media.url);
  const fileName = getExportFileName(media, index);
  
  try {
    await copyFile(srcPath, destDir, fileName);
    stats.locationExports++;
  } catch {
    stats.errors++;
  }
}

/**
 * Export issue media (to by_location and by_category)
 */
async function exportIssueMedia(media: any, index: number, stats: ExportStats): Promise<void> {
  const issue = await getIssue(media.entityId);
  if (!issue) {
    console.log(`  Skipping: Issue ${media.entityId} not found`);
    stats.skipped++;
    return;
  }
  
  // Only handle inventory_item issues for now
  if (issue.entityType !== 'inventory_item') {
    console.log(`  Skipping: Issue entity type is ${issue.entityType}, not inventory_item`);
    stats.skipped++;
    return;
  }
  
  const inventoryItem = await getInventoryItem(issue.entityId);
  if (!inventoryItem) {
    console.log(`  Skipping: InventoryItem ${issue.entityId} not found`);
    stats.skipped++;
    return;
  }
  
  const srcPath = getSourcePath(media.url);
  const baseFileName = getExportFileName(media, index);
  
  // Get product and location info for filename prefixes
  const product = await getProduct(inventoryItem.productId);
  const productName = product ? normalizeName(product.name) : 'unknown-product';
  
  let locationName = 'unknown-location';
  if (inventoryItem.locationId) {
    const location = await getLocation(inventoryItem.locationId);
    if (location) {
      locationName = normalizeName(location.name);
    }
  }
  
  // Export by location (prefix with productName)
  if (inventoryItem.locationId) {
    const destDir = path.join(ROOT_PATH, 'by_location', locationName);
    const fileName = `${productName}-${baseFileName}`;
    try {
      await copyFile(srcPath, destDir, fileName);
    } catch {
      stats.errors++;
    }
  }
  
  // Export by category (prefix with locationName)
  if (product?.categoryId) {
    const catPath = await getCategoryPath(product.categoryId);
    let destDir: string;
    if (catPath.child) {
      destDir = path.join(ROOT_PATH, 'by_category', catPath.parent, catPath.child);
    } else {
      destDir = path.join(ROOT_PATH, 'by_category', catPath.parent);
    }
    const fileName = `${locationName}-${baseFileName}`;
    try {
      await copyFile(srcPath, destDir, fileName);
      stats.issueExports++;
    } catch {
      stats.errors++;
    }
  } else {
    console.log(`  Skipping category export: No category for product ${inventoryItem.productId}`);
  }
}

/**
 * Main export function
 */
async function exportMedia(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Media Export Script');
  console.log('='.repeat(60));
  console.log(`Root Path: ${ROOT_PATH}`);
  console.log(`Upload Dir: ${UPLOAD_DIR}`);
  console.log(`Dry Run: ${DRY_RUN}`);
  if (CUSTOMER_ID) console.log(`Customer ID: ${CUSTOMER_ID}`);
  if (HOME_ID) console.log(`Home ID: ${HOME_ID}`);
  console.log('='.repeat(60));
  
  // Build query conditions
  const conditions = [
    eq(schema.mediaAssets.isActive, true)
  ];
  
  if (CUSTOMER_ID) {
    conditions.push(eq(schema.mediaAssets.customerId, CUSTOMER_ID));
  }
  if (HOME_ID) {
    conditions.push(eq(schema.mediaAssets.homeId, HOME_ID));
  }
  
  // Only export location and issue media for now
  const locationMedia = await db
    .select()
    .from(schema.mediaAssets)
    .where(and(
      ...conditions,
      eq(schema.mediaAssets.entityType, 'location')
    ))
    .orderBy(schema.mediaAssets.entityId, schema.mediaAssets.sortOrder);
  
  const issueMedia = await db
    .select()
    .from(schema.mediaAssets)
    .where(and(
      ...conditions,
      eq(schema.mediaAssets.entityType, 'issue')
    ))
    .orderBy(schema.mediaAssets.entityId, schema.mediaAssets.sortOrder);
  
  const stats: ExportStats = {
    total: locationMedia.length + issueMedia.length,
    locationExports: 0,
    issueExports: 0,
    skipped: 0,
    errors: 0
  };
  
  console.log(`\nFound ${locationMedia.length} location media assets`);
  console.log(`Found ${issueMedia.length} issue media assets`);
  console.log('');
  
  // Process location media
  console.log('\n--- Exporting Location Media ---');
  for (let i = 0; i < locationMedia.length; i++) {
    const media = locationMedia[i];
    console.log(`\n[${i + 1}/${locationMedia.length}] Processing location media ID ${media.id}...`);
    await exportLocationMedia(media, i, stats);
  }
  
  // Process issue media
  console.log('\n--- Exporting Issue Media ---');
  for (let i = 0; i < issueMedia.length; i++) {
    const media = issueMedia[i];
    console.log(`\n[${i + 1}/${issueMedia.length}] Processing issue media ID ${media.id}...`);
    await exportIssueMedia(media, i, stats);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Export Summary');
  console.log('='.repeat(60));
  console.log(`Total media assets: ${stats.total}`);
  console.log(`Location exports: ${stats.locationExports}`);
  console.log(`Issue exports: ${stats.issueExports}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log('='.repeat(60));
}

// Run
exportMedia()
  .then(() => {
    console.log('\nExport complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nExport failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });

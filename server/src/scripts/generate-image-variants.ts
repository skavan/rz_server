/**
 * Batch Image Variant Generation Script
 * 
 * Processes all existing media assets and generates optimized variants.
 * 
 * Usage:
 *   npx tsx src/scripts/generate-image-variants.ts [--force] [--limit=N]
 * 
 * Options:
 *   --force   Regenerate variants even if they already exist
 *   --limit=N Process only N images (for testing)
 */

import { Pool } from 'pg';
import { drizzle, eq } from '@postgress/shared';
import * as schema from '@postgress/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  generateImageVariants, 
  isImageFile, 
  VARIANT_CONFIGS 
} from '../utils/image-variants.js';

dotenv.config();

const WINDOWS_ABS_PATH_RE = /^[A-Za-z]:[\\/]/;

function resolvePathFromCwd(rawPath: string, envVarName: string): string {
  if (process.platform !== 'win32' && WINDOWS_ABS_PATH_RE.test(rawPath)) {
    throw new Error(
      `${envVarName} is set to a Windows-style path (${rawPath}) on ${process.platform}. ` +
      `Set ${envVarName} to a Linux path (for example: /var/lib/rz_server/media or ./uploads).`
    );
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

const UPLOAD_DIR = resolvePathFromCwd(process.env.UPLOAD_DIR || 'uploads', 'UPLOAD_DIR');
const CHUNK_SIZE = 50;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const LIMIT = (() => {
  const arg = args.find(a => a.startsWith('--limit='));
  return arg ? parseInt(arg.split('=')[1], 10) : undefined;
})();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

interface Stats {
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  variantsCreated: number;
}

async function processChunk(
  assets: Array<{ id: number; url: string; mimeType: string | null }>,
  stats: Stats
): Promise<void> {
  for (const asset of assets) {
    stats.total++;

    if (!isImageFile(asset.mimeType)) {
      console.log(`  [${asset.id}] Skipping non-image: ${asset.mimeType}`);
      stats.skipped++;
      continue;
    }

    const absolutePath = path.join(UPLOAD_DIR, asset.url);

    try {
      await fs.access(absolutePath);
    } catch {
      console.log(`  [${asset.id}] File not found: ${asset.url}`);
      stats.errors++;
      continue;
    }

    console.log(`  [${asset.id}] Processing: ${asset.url}`);

    try {
      const result = await generateImageVariants(absolutePath, { force: FORCE });

      if (result.errors.length > 0) {
        console.log(`    Errors: ${result.errors.join(', ')}`);
        stats.errors++;
      }

      for (const variant of result.variants) {
        if (variant.skipped) {
          console.log(`    ${variant.variant}: already exists (skipped)`);
        } else {
          console.log(`    ${variant.variant}: ${variant.width}x${variant.height}, ${Math.round(variant.size / 1024)}KB`);
          stats.variantsCreated++;
        }
      }

      stats.processed++;
    } catch (err: any) {
      console.error(`    ERROR: ${err.message}`);
      stats.errors++;
    }
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Image Variant Generation Script');
  console.log('='.repeat(60));
  console.log(`Upload Dir: ${UPLOAD_DIR}`);
  console.log(`Force Regenerate: ${FORCE}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);
  console.log(`Variants: ${Object.keys(VARIANT_CONFIGS).join(', ')}`);
  console.log('='.repeat(60));

  const stats: Stats = {
    total: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    variantsCreated: 0,
  };

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const chunkLimit = LIMIT ? Math.min(CHUNK_SIZE, LIMIT - stats.total) : CHUNK_SIZE;
    
    if (chunkLimit <= 0) break;

    console.log(`\nFetching chunk at offset ${offset}...`);

    const assets = await db
      .select({
        id: schema.mediaAssets.id,
        url: schema.mediaAssets.url,
        mimeType: schema.mediaAssets.mimeType,
      })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.isActive, true))
      .orderBy(schema.mediaAssets.id)
      .limit(chunkLimit)
      .offset(offset);

    if (assets.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Processing ${assets.length} assets...`);
    await processChunk(assets, stats);

    offset += assets.length;

    if (assets.length < chunkLimit) {
      hasMore = false;
    }

    if (LIMIT && stats.total >= LIMIT) {
      hasMore = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total assets checked: ${stats.total}`);
  console.log(`Images processed: ${stats.processed}`);
  console.log(`Non-images skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Variants created: ${stats.variantsCreated}`);
  console.log('='.repeat(60));
}

main()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFailed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });

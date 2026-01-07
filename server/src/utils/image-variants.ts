/**
 * Image Variant Generation Utility
 * 
 * Generates optimized image variants for different use cases:
 * - print: 1200px max, 85% quality (PDFs, print documents)
 * - web: 600px max, 80% quality (galleries, detail views)
 * - thumb: 200px max, 75% quality (lists, thumbnails)
 */

import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VariantConfig {
  suffix: string;
  maxDimension: number;
  quality: number;
}

export const VARIANT_CONFIGS: Record<string, VariantConfig> = {
  print: { suffix: '-print', maxDimension: 1200, quality: 85 },
  web: { suffix: '-web', maxDimension: 600, quality: 80 },
  thumb: { suffix: '-thumb', maxDimension: 200, quality: 75 },
};

export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

export function isImageFile(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase());
}

export function getVariantPath(originalPath: string, suffix: string): string {
  const ext = path.extname(originalPath);
  const base = originalPath.slice(0, -ext.length);
  return `${base}${suffix}.jpg`;
}

export interface VariantResult {
  variant: string;
  path: string;
  width: number;
  height: number;
  size: number;
  skipped: boolean;
}

export interface GenerateVariantsResult {
  original: string;
  variants: VariantResult[];
  errors: string[];
}

/**
 * Generate all variants for a single image file
 */
export async function generateImageVariants(
  originalAbsolutePath: string,
  options: { force?: boolean } = {}
): Promise<GenerateVariantsResult> {
  const result: GenerateVariantsResult = {
    original: originalAbsolutePath,
    variants: [],
    errors: [],
  };

  try {
    const originalBuffer = await fs.readFile(originalAbsolutePath);
    const metadata = await sharp(originalBuffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      result.errors.push('Could not read image dimensions');
      return result;
    }

    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const originalMaxDim = Math.max(originalWidth, originalHeight);

    for (const [variantName, config] of Object.entries(VARIANT_CONFIGS)) {
      const variantPath = getVariantPath(originalAbsolutePath, config.suffix);

      try {
        if (!options.force) {
          try {
            await fs.access(variantPath);
            result.variants.push({
              variant: variantName,
              path: variantPath,
              width: 0,
              height: 0,
              size: 0,
              skipped: true,
            });
            continue;
          } catch {
            // File doesn't exist, proceed to generate
          }
        }

        if (originalMaxDim <= config.maxDimension) {
          await fs.copyFile(originalAbsolutePath, variantPath);
          const stats = await fs.stat(variantPath);
          result.variants.push({
            variant: variantName,
            path: variantPath,
            width: originalWidth,
            height: originalHeight,
            size: stats.size,
            skipped: false,
          });
        } else {
          const resized = await sharp(originalBuffer)
            .resize({
              width: config.maxDimension,
              height: config.maxDimension,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: config.quality })
            .toBuffer();

          await fs.writeFile(variantPath, resized);
          
          const resizedMeta = await sharp(resized).metadata();
          result.variants.push({
            variant: variantName,
            path: variantPath,
            width: resizedMeta.width || 0,
            height: resizedMeta.height || 0,
            size: resized.length,
            skipped: false,
          });
        }
      } catch (err: any) {
        result.errors.push(`${variantName}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`Failed to process image: ${err.message}`);
  }

  return result;
}

/**
 * Generate variants from a buffer (for use during upload)
 */
export async function generateImageVariantsFromBuffer(
  buffer: Buffer,
  basePath: string,
  baseFilename: string
): Promise<GenerateVariantsResult> {
  const ext = path.extname(baseFilename);
  const nameWithoutExt = baseFilename.slice(0, -ext.length);
  const originalPath = path.join(basePath, baseFilename);

  const result: GenerateVariantsResult = {
    original: originalPath,
    variants: [],
    errors: [],
  };

  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      result.errors.push('Could not read image dimensions');
      return result;
    }

    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const originalMaxDim = Math.max(originalWidth, originalHeight);

    for (const [variantName, config] of Object.entries(VARIANT_CONFIGS)) {
      const variantFilename = `${nameWithoutExt}${config.suffix}.jpg`;
      const variantPath = path.join(basePath, variantFilename);

      try {
        if (originalMaxDim <= config.maxDimension) {
          await fs.writeFile(variantPath, buffer);
          result.variants.push({
            variant: variantName,
            path: variantPath,
            width: originalWidth,
            height: originalHeight,
            size: buffer.length,
            skipped: false,
          });
        } else {
          const resized = await sharp(buffer)
            .resize({
              width: config.maxDimension,
              height: config.maxDimension,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: config.quality })
            .toBuffer();

          await fs.writeFile(variantPath, resized);
          
          const resizedMeta = await sharp(resized).metadata();
          result.variants.push({
            variant: variantName,
            path: variantPath,
            width: resizedMeta.width || 0,
            height: resizedMeta.height || 0,
            size: resized.length,
            skipped: false,
          });
        }
      } catch (err: any) {
        result.errors.push(`${variantName}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`Failed to process image: ${err.message}`);
  }

  return result;
}

/**
 * Delete all variants for an image
 */
export async function deleteImageVariants(originalAbsolutePath: string): Promise<void> {
  for (const config of Object.values(VARIANT_CONFIGS)) {
    const variantPath = getVariantPath(originalAbsolutePath, config.suffix);
    try {
      await fs.unlink(variantPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

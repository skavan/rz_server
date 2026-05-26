/**
 * Image Resolver Processor for PDF Generation
 * 
 * Parses HTML to find images with data-media-id attributes,
 * validates access, reads from storage, and converts to base64.
 */
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { mediaAssets, eq, and } from '@skavan/rentalzen-drizzle';
import { withTenantScope } from '../../db/index.js';
import { storage } from '../../utils/storage.js';
import type { ProcessingContext, ImageOptions, MediaReference } from '../types.js';

const VARIANT_SUFFIXES: Record<string, string> = {
  print: '-print',
  web: '-web',
  thumb: '-thumb',
  view: '-print',  // 'view' from client maps to print variant
};

const MIME_TO_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

interface MediaAssetRow {
  id: number;
  url: string;
  mimeType: string;
  customerId: number;
}

/**
 * Parse media ID from URL pattern /api/media/serve/:id
 */
function parseMediaIdFromUrl(src: string): number | null {
  const match = src.match(/\/api\/media\/serve\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Build variant path from original URL
 */
function buildVariantPath(originalUrl: string, variant: string): string {
  if (variant === 'original') return originalUrl;
  
  const suffix = VARIANT_SUFFIXES[variant];
  if (!suffix) return originalUrl;
  
  const ext = path.extname(originalUrl);
  const base = originalUrl.slice(0, -ext.length);
  return `${base}${suffix}.jpg`;
}

/**
 * Resolve the best available variant path
 */
async function resolveVariantPath(
  originalUrl: string,
  preferredVariant: string
): Promise<{ path: string; isVariant: boolean }> {
  if (preferredVariant === 'original') {
    return { path: originalUrl, isVariant: false };
  }

  const variantPath = buildVariantPath(originalUrl, preferredVariant);
  if (await storage.exists(variantPath)) {
    return { path: variantPath, isVariant: true };
  }

  // Fallback cascade: print -> web -> original
  const fallbackOrder = ['print', 'web'];
  for (const fallback of fallbackOrder) {
    if (fallback === preferredVariant) continue;
    const fallbackPath = buildVariantPath(originalUrl, fallback);
    if (await storage.exists(fallbackPath)) {
      return { path: fallbackPath, isVariant: true };
    }
  }

  // Fall back to original
  return { path: originalUrl, isVariant: false };
}

/**
 * Process image with Sharp if quality/dimension options specified
 */
async function processImage(
  buffer: Buffer,
  mimeType: string,
  options: { quality?: number; maxWidth?: number; maxHeight?: number }
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { quality, maxWidth, maxHeight } = options;
  
  // If no processing needed, return as-is
  if (!quality && !maxWidth && !maxHeight) {
    return { buffer, mimeType };
  }

  let pipeline = sharp(buffer);

  // Resize if dimensions specified
  if (maxWidth || maxHeight) {
    pipeline = pipeline.resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Recompress with quality if specified
  const outputFormat = MIME_TO_FORMAT[mimeType] || 'jpeg';
  const outputQuality = quality || 85;

  switch (outputFormat) {
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: outputQuality });
      break;
    case 'png':
      pipeline = pipeline.png({ quality: outputQuality });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality: outputQuality });
      break;
    default:
      pipeline = pipeline.jpeg({ quality: outputQuality });
  }

  const processedBuffer = await pipeline.toBuffer();
  const outputMimeType = outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`;

  return { buffer: processedBuffer, mimeType: outputMimeType };
}

/**
 * Read image file and convert to base64 data URL
 */
async function readImageAsBase64(
  filePath: string,
  mimeType: string,
  options: { quality?: number; maxWidth?: number; maxHeight?: number }
): Promise<string> {
  const absolutePath = storage.getAbsolutePath(filePath);
  const buffer = await fs.readFile(absolutePath);
  
  const processed = await processImage(buffer, mimeType, options);
  const base64 = processed.buffer.toString('base64');
  
  return `data:${processed.mimeType};base64,${base64}`;
}

/**
 * Query media asset with tenant scope
 */
async function getMediaAsset(
  mediaId: number,
  context: ProcessingContext
): Promise<MediaAssetRow | null> {
  const rows = await withTenantScope(
    { customerId: context.customerId, homeIds: context.homeIds },
    async (scopedDb) => {
      return scopedDb
        .select({
          id: mediaAssets.id,
          url: mediaAssets.url,
          mimeType: mediaAssets.mimeType,
          customerId: mediaAssets.customerId,
        })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.customerId, context.customerId),
            eq(mediaAssets.id, mediaId),
            eq(mediaAssets.isActive, true)
          )
        )
        .limit(1);
    }
  );

  return rows[0] || null;
}

/**
 * Generate placeholder SVG for missing images
 */
function generatePlaceholderSvg(width = 200, height = 150): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af" font-family="sans-serif" font-size="14">Image unavailable</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Main function to resolve all images in HTML
 */
export interface ResolveImagesOptions extends ImageOptions {
  /** Use file:// URLs instead of base64 (better for large reports, required for PDF render) */
  useFileUrls?: boolean;
  /** Max images to process (for preview mode to avoid memory issues) */
  maxImages?: number;
  /** Use placeholder images instead of real ones (fast preview) */
  usePlaceholders?: boolean;
}

export async function resolveImages(
  $: cheerio.CheerioAPI,
  context: ProcessingContext,
  options: ResolveImagesOptions
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const defaultVariant = options.defaultVariant || 'print';
  const skipOnError = options.skipOnError !== false;
  const useFileUrls = options.useFileUrls ?? true; // Default to file URLs to avoid memory issues
  const maxImages = options.maxImages; // undefined = no limit
  const usePlaceholders = options.usePlaceholders ?? false;

  // Track variant usage by actual file suffix
  const variantCounts: Record<string, number> = { print: 0, web: 0, thumb: 0, original: 0 };

  // Find all images with data-media-id or matching URL pattern
  const allImages = $('img[data-media-id], img[src*="/api/media/serve/"]').toArray();
  const imagesToProcess = maxImages ? allImages.slice(0, maxImages) : allImages;
  
  if (maxImages && allImages.length > maxImages) {
    errors.push(`Preview limited to ${maxImages} images (${allImages.length} total)`);
  }

  for (const imgElement of imagesToProcess) {
    const $img = $(imgElement);
    
    // Extract media ID from attribute or URL
    let mediaId: number | null = null;
    const dataMediaId = $img.attr('data-media-id');
    
    if (dataMediaId) {
      mediaId = parseInt(dataMediaId, 10);
    } else {
      const src = $img.attr('src') || '';
      mediaId = parseMediaIdFromUrl(src);
    }

    if (!mediaId || isNaN(mediaId)) {
      console.log(`📷 Skipping image - no valid mediaId found`);
      continue;
    }

    // Extract processing options from data attributes
    const variant = $img.attr('data-media-variant') || defaultVariant;
    const fallback = ($img.attr('data-media-fallback') as 'placeholder' | 'hide' | 'error') || 'placeholder';
    const quality = $img.attr('data-media-quality') ? parseInt($img.attr('data-media-quality')!, 10) : undefined;
    const maxWidth = $img.attr('data-media-max-width') ? parseInt($img.attr('data-media-max-width')!, 10) : undefined;
    const maxHeight = $img.attr('data-media-max-height') ? parseInt($img.attr('data-media-max-height')!, 10) : undefined;

    try {
      // Query media asset with tenant scope
      const asset = await getMediaAsset(mediaId, context);

      if (!asset) {
        throw new Error(`Media asset ${mediaId} not found or access denied`);
      }

      // Resolve the variant path
      const { path: filePath, isVariant } = await resolveVariantPath(asset.url, variant);

      // Track by actual file suffix
      if (filePath.includes('-print')) variantCounts.print++;
      else if (filePath.includes('-web')) variantCounts.web++;
      else if (filePath.includes('-thumb')) variantCounts.thumb++;
      else variantCounts.original++;

      // Check if file exists
      if (!(await storage.exists(filePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Determine MIME type (variants are always JPEG)
      const mimeType = isVariant ? 'image/jpeg' : asset.mimeType;

      if (usePlaceholders) {
        // Use placeholder SVG for fast preview (no image loading)
        $img.attr('src', generatePlaceholderSvg(150, 100));
        $img.attr('title', `Image #${mediaId}`);
      } else if (useFileUrls) {
        // Use file:// URL - Playwright can load these directly
        const absolutePath = storage.getAbsolutePath(filePath);
        const fileUrl = `file:///${absolutePath.replace(/\\/g, '/')}`;
        $img.attr('src', fileUrl);
      } else {
        // Read and convert to base64 (can cause memory issues with many images)
        const dataUrl = await readImageAsBase64(filePath, mimeType, {
          quality,
          maxWidth,
          maxHeight,
        });
        $img.attr('src', dataUrl);
      }

      // Clean up data attributes and remove lazy loading for PDF
      $img.removeAttr('data-media-id');
      $img.removeAttr('data-media-variant');
      $img.removeAttr('data-media-fallback');
      $img.removeAttr('data-media-quality');
      $img.removeAttr('data-media-max-width');
      $img.removeAttr('data-media-max-height');
      $img.removeAttr('loading');  // Remove lazy loading for PDF render

    } catch (err: any) {
      const errorMsg = `Failed to resolve image ${mediaId}: ${err.message}`;
      errors.push(errorMsg);

      if (fallback === 'hide') {
        $img.remove();
      } else if (fallback === 'placeholder') {
        $img.attr('src', generatePlaceholderSvg());
        $img.removeAttr('data-media-id');
        $img.removeAttr('data-media-variant');
        $img.removeAttr('data-media-fallback');
        $img.removeAttr('data-media-quality');
        $img.removeAttr('data-media-max-width');
        $img.removeAttr('data-media-max-height');
      } else if (fallback === 'error') {
        if (!skipOnError) {
          throw new Error(errorMsg);
        }
      }
    }
  }

  // Log variant summary
  const total = variantCounts.print + variantCounts.web + variantCounts.thumb + variantCounts.original;
  console.log(`📷 ${total} images: ${variantCounts.print} print, ${variantCounts.web} web, ${variantCounts.thumb} thumb, ${variantCounts.original} original`);

  return { errors };
}

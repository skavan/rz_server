import { Router } from 'express';
import multer from 'multer';
import {
  mediaAssets,
  products,
  skus,
  inventoryItems,
  locations,
  locationTypes,
  homes,
  issues,
  comments,
  eq,
  and,
  inArray,
  desc,
} from '@postgress/shared';
import type { RequestScope } from '../utils/scope.js';
import { getRequestScope } from '../utils/scope.js';
import { withTenantScope } from '../db/index.js';
import { authenticateToken } from '../auth/index.js';
import { storage } from '../utils/storage.js';
import { eventBus } from '../utils/event-bus.js';
import {
  ValidationError,
  requireNumber,
  parseOptionalString,
  parseOptionalInteger,
  parseOptionalBoolean,
  parseOptionalJson,
  ensureHomeAccess,
} from './shared/validation.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/x-webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

const ENTITY_TABLES = {
  product: products,
  sku: skus,
  inventory_item: inventoryItems,
  location: locations,
  home: homes,
  issue: issues,
  location_type: locationTypes,
  comment: comments,
};

type EntityType = keyof typeof ENTITY_TABLES;

const normalizeTagArray = (value: unknown): number[] | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const source = Array.isArray(value) ? value : [value];
  const tags: number[] = [];

  for (const item of source) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'number' && Number.isFinite(item)) {
      tags.push(item);
      continue;
    }
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        tags.push(numeric);
        continue;
      }
    }
    throw new ValidationError('tags must be an array of numeric IDs');
  }

  return tags;
};

router.get('/serve/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const mediaId = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.customerId, scope.customerId),
              eq(mediaAssets.id, mediaId),
              eq(mediaAssets.isActive, true)
            )
          )
          .limit(1);
      }
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = rows[0];
    const filePath = storage.getAbsolutePath(media.url);
    const exists = await storage.exists(media.url);

    if (!exists) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.sendFile(filePath);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Media serve error:', error);
    res.status(500).json({ error: 'Failed to serve media' });
  }
});

async function verifyEntityAccess(
  scope: RequestScope,
  entityType: string,
  entityId: number
): Promise<boolean> {
  const table = ENTITY_TABLES[entityType as EntityType];
  if (!table) {
    throw new ValidationError(`Invalid entity type: ${entityType}`, 400);
  }

  const rows = await withTenantScope(
    { customerId: scope.customerId, homeIds: scope.homeIds },
    async (scopedDb) => {
      return scopedDb.select({ id: table.id }).from(table).where(eq(table.id, entityId)).limit(1);
    }
  );

  return rows.length > 0;
}

async function updateEntityMediaFlag(
  customerId: number,
  homeIds: number[],
  entityType: string,
  entityId: number,
  hasMedia: boolean
): Promise<void> {
  if (entityType === 'comment') {
    await withTenantScope({ customerId, homeIds }, async (scopedDb) => {
      await scopedDb
        .update(comments)
        .set({ hasAttachments: hasMedia, updatedAt: new Date() })
        .where(eq(comments.id, entityId));
    });
    return;
  }

  const table = ENTITY_TABLES[entityType as EntityType];
  if (!table || !('hasMediaAssets' in table)) return;

  await withTenantScope({ customerId, homeIds }, async (scopedDb) => {
    await scopedDb
      .update(table)
      .set({ hasMediaAssets: hasMedia } as any)
      .where(eq(table.id, entityId));
  });
}

function detectAssetType(mimeType: string): 'image' | 'document' | 'video' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

async function resolveHomeIdForEntity(
  scope: RequestScope,
  entityType: string,
  entityId: number
): Promise<number | null> {
  return withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
    switch (entityType) {
      case 'product': {
        const rows = await scopedDb
          .select({ homeId: products.homeId })
          .from(products)
          .where(eq(products.id, entityId))
          .limit(1);
        return rows[0]?.homeId ?? null;
      }
      case 'sku': {
        const skuRows = await scopedDb
          .select({ productId: skus.productId })
          .from(skus)
          .where(eq(skus.id, entityId))
          .limit(1);
        const productId = skuRows[0]?.productId;
        if (!productId) return null;
        const productRows = await scopedDb
          .select({ homeId: products.homeId })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        return productRows[0]?.homeId ?? null;
      }
      case 'inventory_item': {
        const rows = await scopedDb
          .select({ homeId: inventoryItems.homeId })
          .from(inventoryItems)
          .where(eq(inventoryItems.id, entityId))
          .limit(1);
        return rows[0]?.homeId ?? null;
      }
      case 'location': {
        const rows = await scopedDb
          .select({ homeId: locations.homeId })
          .from(locations)
          .where(eq(locations.id, entityId))
          .limit(1);
        return rows[0]?.homeId ?? null;
      }
      case 'home':
        return entityId;
      case 'issue': {
        const rows = await scopedDb
          .select({ homeId: issues.homeId })
          .from(issues)
          .where(eq(issues.id, entityId))
          .limit(1);
        return rows[0]?.homeId ?? null;
      }
      case 'comment': {
        const rows = await scopedDb
          .select({ homeId: comments.homeId })
          .from(comments)
          .where(and(eq(comments.customerId, scope.customerId), eq(comments.id, entityId)))
          .limit(1);
        return rows[0]?.homeId ?? null;
      }
      case 'location_type':
        return null;
      default:
        return null;
    }
  });
}

router.post('/:entityType/:entityId', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const entityType = String(req.params.entityType);
    const entityId = requireNumber(req.params.entityId, 'entityId');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const hasAccess = await verifyEntityAccess(scope, entityType, entityId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this entity' });
    }

    const savedFile = await storage.save(req.file, scope.customerId, entityType, entityId);
    
    const assetType = detectAssetType(savedFile.mimeType);
    const title = parseOptionalString(req.body?.title) || savedFile.originalName;
    const description = parseOptionalString(req.body?.description);
    const isPrimary = parseOptionalBoolean(req.body?.isPrimary, 'isPrimary') || false;
    const sortOrder = parseOptionalInteger(req.body?.sortOrder, 'sortOrder') || 0;
    const rawTags = parseOptionalJson(req.body?.tags, 'tags');
    console.log('🪵 Media upload tags payload:', {
      raw: req.body?.tags,
      parsed: rawTags,
      normalized: rawTags === undefined ? undefined : normalizeTagArray(rawTags),
    });
    const tags = normalizeTagArray(rawTags);

    let homeId: number | null;
    if (entityType === 'location_type') {
      const homeIdInput = parseOptionalInteger(req.body?.homeId ?? req.body?.home_id, 'homeId');
      if (homeIdInput === undefined || homeIdInput === null) {
        return res.status(400).json({ error: 'homeId is required for location type media' });
      }
      ensureHomeAccess(scope, homeIdInput);
      homeId = homeIdInput;
    } else {
      homeId = await resolveHomeIdForEntity(scope, entityType, entityId);
    }

    if (homeId === null && entityType !== 'comment') {
      return res.status(400).json({ error: 'Unable to resolve home for this media asset' });
    }

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .insert(mediaAssets)
          .values({
            customerId: scope.customerId,
            homeId,
            entityType: entityType as any,
            entityId,
            url: savedFile.relativePath,
            title,
            description,
            fileName: savedFile.filename,
            fileSize: savedFile.size,
            mimeType: savedFile.mimeType,
            assetType,
            isPrimary,
            sortOrder,
            tags: tags ?? null,
            isActive: true,
          })
          .returning();
      }
    );

    const created = rows[0];

    await updateEntityMediaFlag(scope.customerId, scope.homeIds, entityType, entityId, true);

    eventBus.broadcast({
      event: 'data_change:media_assets',
      data: { type: 'create', resource: 'media_assets', resourceId: created.id, data: created },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: scope.customerId, homeIds: scope.homeIds },
      },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Media upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload media' });
  }
});

router.get('/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const entityType = String(req.params.entityType);
    const entityId = requireNumber(req.params.entityId, 'entityId');

    const hasAccess = await verifyEntityAccess(scope, entityType, entityId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this entity' });
    }

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.customerId, scope.customerId),
              eq(mediaAssets.entityType, entityType as any),
              eq(mediaAssets.entityId, entityId),
              eq(mediaAssets.isActive, true)
            )
          )
          .orderBy(desc(mediaAssets.isPrimary), mediaAssets.sortOrder);
      }
    );

    res.json({ data: rows, meta: { count: rows.length } });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Media list error:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const mediaId = requireNumber(req.params.id, 'id');

    const updates: Record<string, any> = {};

    if (req.body?.title !== undefined) {
      updates.title = parseOptionalString(req.body.title);
    }
    if (req.body?.description !== undefined) {
      updates.description = parseOptionalString(req.body.description);
    }
    if (req.body?.sortOrder !== undefined) {
      updates.sortOrder = parseOptionalInteger(req.body.sortOrder, 'sortOrder');
    }
    if (req.body?.isPrimary !== undefined) {
      updates.isPrimary = parseOptionalBoolean(req.body.isPrimary, 'isPrimary');
    }
    if (req.body?.tags !== undefined) {
      const rawTags = parseOptionalJson(req.body.tags, 'tags');
      console.log('🪵 Media update tags payload:', {
        raw: req.body.tags,
        parsed: rawTags,
        normalized: normalizeTagArray(rawTags),
      });
      const tags = normalizeTagArray(rawTags);
      updates.tags = tags ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.updatedAt = new Date();

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .update(mediaAssets)
          .set(updates)
          .where(and(eq(mediaAssets.customerId, scope.customerId), eq(mediaAssets.id, mediaId)))
          .returning();
      }
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:media_assets',
      data: { type: 'update', resource: 'media_assets', resourceId: updated.id, data: updated },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: scope.customerId, homeIds: scope.homeIds },
      },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Media update error:', error);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const mediaId = requireNumber(req.params.id, 'id');

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .delete(mediaAssets)
          .where(and(eq(mediaAssets.customerId, scope.customerId), eq(mediaAssets.id, mediaId)))
          .returning();
      }
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const deleted = rows[0];

    await storage.delete(deleted.url);

    const remainingMedia = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.customerId, scope.customerId),
              eq(mediaAssets.entityType, deleted.entityType),
              eq(mediaAssets.entityId, deleted.entityId),
              eq(mediaAssets.isActive, true)
            )
          )
          .limit(1);
      }
    );

    if (remainingMedia.length === 0) {
      await updateEntityMediaFlag(
        scope.customerId,
        scope.homeIds,
        deleted.entityType,
        deleted.entityId,
        false
      );
    }

    eventBus.broadcast({
      event: 'data_change:media_assets',
      data: { type: 'delete', resource: 'media_assets', resourceId: deleted.id, data: deleted },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: scope.customerId, homeIds: scope.homeIds },
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Media delete error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

router.patch('/:id/primary', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const mediaId = requireNumber(req.params.id, 'id');

    const media = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const rows = await scopedDb.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
        return rows[0];
      }
    );

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      await scopedDb
        .update(mediaAssets)
        .set({ isPrimary: false })
        .where(
          and(
            eq(mediaAssets.entityType, media.entityType),
            eq(mediaAssets.entityId, media.entityId)
          )
        );
    });

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .update(mediaAssets)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(mediaAssets.id, mediaId))
          .returning();
      }
    );

    const updated = rows[0];

    eventBus.broadcast({
      event: 'data_change:media_assets',
      data: { type: 'update', resource: 'media_assets', resourceId: updated.id, data: updated },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: scope.customerId, homeIds: scope.homeIds },
      },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Media set primary error:', error);
    res.status(500).json({ error: 'Failed to set primary media' });
  }
});

export default router;

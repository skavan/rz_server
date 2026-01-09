/**
 * Media Asset Types Reference
 * 
 * Import these in your client:
 * import type { MediaAsset, NewMediaAsset } from '@postgress/shared';
 */

/**
 * MediaAsset - Full record from database (SELECT)
 */
export type MediaAsset = {
  id: number;
  customerId: number | null;
  homeId: number | null;
  entityType: 'product' | 'sku' | 'inventory_item' | 'location' | 'home' | 'issue' | 'location_type' | 'comment' | 'todo' | 'inventory_purchase_order';
  entityId: number;
  url: string;
  title: string | null;
  description: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  assetType: 'image' | 'document' | 'video' | 'link';
  isPrimary: boolean | null;
  sortOrder: number | null;
  tags: number[] | null;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * NewMediaAsset - For creating new records (INSERT)
 */
export type NewMediaAsset = {
  id?: number;
  customerId?: number | null;
  homeId?: number | null;
  entityType: 'product' | 'sku' | 'inventory_item' | 'location' | 'home' | 'issue' | 'location_type' | 'comment' | 'todo' | 'inventory_purchase_order';
  entityId: number;
  url: string;
  title?: string | null;
  description?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  assetType?: 'image' | 'document' | 'video' | 'link';
  isPrimary?: boolean | null;
  sortOrder?: number | null;
  tags?: number[] | null;
  isActive?: boolean | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

/**
 * Example Usage in Client
 */

// GET /api/media/:entityType/:entityId
type GetMediaResponse = {
  data: MediaAsset[];
  meta: { count: number };
};

// POST /api/media/:entityType/:entityId (FormData)
// Returns single MediaAsset

// PUT /api/media/:id
type UpdateMediaPayload = {
  title?: string;
  description?: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

// DELETE /api/media/:id
type DeleteMediaResponse = {
  success: boolean;
};

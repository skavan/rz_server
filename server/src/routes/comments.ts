import { Router, type Request, type Response } from 'express';
import {
  comments,
  issues,
  inventoryItems,
  inventoryActionRequests,
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  homes,
  locations,
  products,
  skus,
  bookingReservations,
  customers,
  users,
  todos,
  eq,
  and,
  asc,
  desc,
  isNull,
} from '@skavan/rentalzen-drizzle';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import { getRequestScope, type RequestScope } from '../utils/scope.js';
import { withTenantScope } from '../db/index.js';
import { eventBus } from '../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalBoolean,
  parseOptionalInteger,
  parseOptionalJson,
  parseOptionalString,
  parsePagination,
  ensureHomeAccess,
  requireNumber,
} from './shared/validation.js';

const router = Router();

const COMMENT_ENTITY_VALUES = [
  'issue',
  'inventory_item',
  'inventory_action_request',
  'inventory_purchase_order',
  'inventory_purchase_order_item',
  'home',
  'location',
  'product',
  'sku',
  'todo',
  'booking_reservation',
  'customer',
  'user',
] as const;

type CommentEntityType = (typeof COMMENT_ENTITY_VALUES)[number];
const COMMENT_ENTITY_SET = new Set(COMMENT_ENTITY_VALUES);

const COMMENT_VISIBILITY_VALUES = ['tenant', 'internal', 'external'] as const;
type CommentVisibility = (typeof COMMENT_VISIBILITY_VALUES)[number];
const COMMENT_VISIBILITY_SET = new Set(COMMENT_VISIBILITY_VALUES);

const COMMENT_TYPE_VALUES = ['user', 'system', 'email_inbound', 'email_outbound', 'note'] as const;
type CommentType = (typeof COMMENT_TYPE_VALUES)[number];
const COMMENT_TYPE_SET = new Set(COMMENT_TYPE_VALUES);

type CommentRow = typeof comments.$inferSelect;

type EntityContext = { homeId: number | null };

const ORDER_VALUES = new Set(['asc', 'desc']);

function coerceEntityType(value: unknown): CommentEntityType {
  if (typeof value !== 'string') {
    throw new ValidationError('entityType is required');
  }
  const normalized = value.trim() as CommentEntityType;
  if (!COMMENT_ENTITY_SET.has(normalized)) {
    throw new ValidationError(`entityType must be one of ${COMMENT_ENTITY_VALUES.join(', ')}`);
  }
  return normalized;
}

function coerceVisibility(value: unknown): CommentVisibility {
  if (value === undefined || value === null || value === '') return 'tenant';
  const vis = String(value) as CommentVisibility;
  if (!COMMENT_VISIBILITY_SET.has(vis)) {
    throw new ValidationError(`visibility must be one of ${COMMENT_VISIBILITY_VALUES.join(', ')}`);
  }
  return vis;
}

function coerceCommentType(value: unknown): CommentType {
  if (value === undefined || value === null || value === '') return 'user';
  const type = String(value) as CommentType;
  if (!COMMENT_TYPE_SET.has(type)) {
    throw new ValidationError(`commentType must be one of ${COMMENT_TYPE_VALUES.join(', ')}`);
  }
  return type;
}

function parseOrder(value: unknown): 'asc' | 'desc' {
  if (typeof value !== 'string') return 'asc';
  const normalized = value.toLowerCase();
  return ORDER_VALUES.has(normalized) ? (normalized as 'asc' | 'desc') : 'asc';
}

function parseMentions(value: unknown): number[] {
  if (value === undefined || value === null || value === '') return [];
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [value];

  const mentions: number[] = [];
  for (const item of source) {
    if (item === null || item === undefined || item === '') continue;
    const num = Number(item);
    if (!Number.isFinite(num)) {
      throw new ValidationError('mentions must contain numeric user IDs');
    }
    const id = Math.trunc(num);
    if (!mentions.includes(id)) {
      mentions.push(id);
    }
  }
  return mentions;
}

const MAX_SUBJECT_LENGTH = 255;

function sanitizeSubjectInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const parsed = parseOptionalString(value);
  if (parsed && parsed.length > MAX_SUBJECT_LENGTH) {
    throw new ValidationError(`subject must be ${MAX_SUBJECT_LENGTH} characters or fewer`);
  }
  return parsed;
}

function generateDefaultSubject(entityType: CommentEntityType, entityId: number): string {
  const friendly = entityType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const base = `${friendly} #${entityId}`;
  return base.length > MAX_SUBJECT_LENGTH ? base.slice(0, MAX_SUBJECT_LENGTH) : base;
}

function normalizeCommentBody(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError('body is required');
  }

  const extract = (input: unknown): string => {
    if (input === undefined || input === null || input === '') {
      throw new ValidationError('body is required');
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) {
        throw new ValidationError('body is required');
      }
      return trimmed;
    }
    if (typeof input === 'object') {
      const html = (input as any)?.html;
      if (typeof html === 'string') {
        return extract(html);
      }
      const serialized = JSON.stringify(input);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
      throw new ValidationError('body must include HTML content');
    }
    const coerced = String(input).trim();
    if (!coerced) {
      throw new ValidationError('body is required');
    }
    return coerced;
  };

  const html = extract(value);
  if (html.length > 40000) {
    throw new ValidationError('body exceeds 40k character limit');
  }
  return html;
}

async function assertEntityContext(
  scope: RequestScope,
  entityType: CommentEntityType,
  entityId: number
): Promise<EntityContext> {
  return withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
    switch (entityType) {
      case 'issue': {
        const rows = await scopedDb
          .select({ homeId: issues.homeId })
          .from(issues)
          .where(and(eq(issues.customerId, scope.customerId), eq(issues.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Issue not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId != null) ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'inventory_item': {
        const rows = await scopedDb
          .select({ homeId: inventoryItems.homeId })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.customerId, scope.customerId), eq(inventoryItems.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Inventory item not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId != null) ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'inventory_action_request': {
        const rows = await scopedDb
          .select({ homeId: inventoryActionRequests.homeId })
          .from(inventoryActionRequests)
          .where(and(eq(inventoryActionRequests.customerId, scope.customerId), eq(inventoryActionRequests.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Inventory action request not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId != null) ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'inventory_purchase_order': {
        const rows = await scopedDb
          .select({ id: inventoryPurchaseOrders.id })
          .from(inventoryPurchaseOrders)
          .where(and(eq(inventoryPurchaseOrders.customerId, scope.customerId), eq(inventoryPurchaseOrders.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Inventory purchase order not found', 404);
        return { homeId: null };
      }
      case 'inventory_purchase_order_item': {
        const rows = await scopedDb
          .select({ id: inventoryPurchaseOrderItems.id })
          .from(inventoryPurchaseOrderItems)
          .where(and(eq(inventoryPurchaseOrderItems.customerId, scope.customerId), eq(inventoryPurchaseOrderItems.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Inventory purchase order item not found', 404);
        return { homeId: null };
      }
      case 'home': {
        const rows = await scopedDb
          .select({ id: homes.id })
          .from(homes)
          .where(and(eq(homes.customerId, scope.customerId), eq(homes.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Home not found', 404);
        ensureHomeAccess(scope, entityId);
        return { homeId: entityId };
      }
      case 'location': {
        const rows = await scopedDb
          .select({ homeId: locations.homeId })
          .from(locations)
          .where(eq(locations.id, entityId))
          .limit(1);
        if (!rows.length) throw new ValidationError('Location not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId == null) {
          throw new ValidationError('Location missing home association');
        }
        ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'product': {
        const rows = await scopedDb
          .select({ homeId: products.homeId })
          .from(products)
          .where(eq(products.id, entityId))
          .limit(1);
        if (!rows.length) throw new ValidationError('Product not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId == null) {
          throw new ValidationError('Product missing home association');
        }
        ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'sku': {
        const skuRows = await scopedDb
          .select({ productId: skus.productId, customerId: skus.customerId })
          .from(skus)
          .where(eq(skus.id, entityId))
          .limit(1);
        const skuRow = skuRows[0];
        if (!skuRow || skuRow.customerId !== scope.customerId) {
          throw new ValidationError('SKU not found', 404);
        }
        if (!skuRow.productId) {
          return { homeId: null };
        }
        const productRows = await scopedDb
          .select({ homeId: products.homeId })
          .from(products)
          .where(eq(products.id, skuRow.productId))
          .limit(1);
        const homeId = productRows[0]?.homeId ?? null;
        if (homeId == null) {
          throw new ValidationError('SKU missing product home association');
        }
        ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'todo': {
        const rows = await scopedDb
          .select({ homeId: todos.homeId })
          .from(todos)
          .where(and(eq(todos.customerId, scope.customerId), eq(todos.id, entityId), isNull(todos.deletedAt)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Todo not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId != null) ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'booking_reservation': {
        const rows = await scopedDb
          .select({ homeId: bookingReservations.homeId })
          .from(bookingReservations)
          .where(and(eq(bookingReservations.tenantId, scope.customerId), eq(bookingReservations.id, entityId)))
          .limit(1);
        if (!rows.length) throw new ValidationError('Reservation not found', 404);
        const homeId = rows[0].homeId ?? null;
        if (homeId != null) ensureHomeAccess(scope, homeId);
        return { homeId };
      }
      case 'customer': {
        if (entityId !== scope.customerId) {
          throw new ValidationError('Access denied for customer', 403);
        }
        const rows = await scopedDb
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, entityId))
          .limit(1);
        if (!rows.length) throw new ValidationError('Customer not found', 404);
        return { homeId: null };
      }
      case 'user': {
        const rows = await scopedDb
          .select({ customerId: users.customerId })
          .from(users)
          .where(eq(users.id, entityId))
          .limit(1);
        if (!rows.length || rows[0].customerId !== scope.customerId) {
          throw new ValidationError('User not found', 404);
        }
        return { homeId: null };
      }
      default:
        throw new ValidationError(`Unsupported entityType: ${entityType}`);
    }
  });
}

async function fetchCommentById(scope: RequestScope, id: number): Promise<CommentRow | null> {
  const rows = await withTenantScope(
    { customerId: scope.customerId, homeIds: scope.homeIds },
    async (scopedDb) => {
      return scopedDb
        .select()
        .from(comments)
        .where(and(eq(comments.customerId, scope.customerId), eq(comments.id, id)))
        .limit(1);
    }
  );
  return rows[0] ?? null;
}

function broadcastCommentChange(
  type: 'create' | 'update' | 'delete',
  comment: CommentRow,
  scope: RequestScope
): void {
  const payload = {
    type,
    resource: 'comments',
    resourceId: comment.id,
    entityType: comment.entityType,
    entityId: comment.entityId,
    data: comment,
  };
  const audienceHomes = comment.homeId != null ? [comment.homeId] : scope.homeIds;
  const meta = {
    timestamp: Date.now(),
    source: 'api',
    audience: { customerId: scope.customerId, homeIds: audienceHomes },
  } as const;

  eventBus.broadcast({ event: 'data_change:comments', data: payload, meta });
  eventBus.broadcast({
    event: `data_change:comments:${comment.entityType}:${comment.entityId}`,
    data: payload,
    meta,
  });
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const entityTypeRaw = (req.query.entityType ?? req.query.entity_type) as string | undefined;
    const entityIdRaw = req.query.entityId ?? req.query.entity_id;

    const entityType = entityTypeRaw !== undefined ? coerceEntityType(entityTypeRaw) : undefined;
    const entityId = parseOptionalInteger(entityIdRaw, 'entityId');
    if (entityId != null && !entityType) {
      throw new ValidationError('entityType is required when entityId is provided');
    }

    if (entityType && entityId != null) {
      await assertEntityContext(scope, entityType, entityId);
    }

    const includeDeleted = parseOptionalBoolean(
      req.query.includeDeleted ?? req.query.include_deleted,
      'includeDeleted'
    );
    const includeReplies = parseOptionalBoolean(
      req.query.includeReplies ?? req.query.include_replies,
      'includeReplies'
    );
    const parentId = parseOptionalInteger(req.query.parentId ?? req.query.parent_comment_id, 'parentId');
    const order = parseOrder(req.query.order);

    const predicates = [eq(comments.customerId, scope.customerId)];

    if (entityType) {
      predicates.push(eq(comments.entityType, entityType));
    }
    if (entityId != null) {
      predicates.push(eq(comments.entityId, entityId));
    }

    if (includeDeleted !== true) {
      predicates.push(isNull(comments.deletedAt));
    }

    if (parentId != null) {
      predicates.push(eq(comments.parentCommentId, parentId));
    } else if (includeReplies === false) {
      predicates.push(isNull(comments.parentCommentId));
    }

    const { limit, offset } = parsePagination(req.query.limit, req.query.offset);

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(comments)
          .where(and(...predicates))
          .orderBy(order === 'asc' ? asc(comments.createdAt) : desc(comments.createdAt))
          .limit(limit)
          .offset(offset);
      }
    );

    res.json({
      data: rows,
      meta: {
        count: rows.length,
        limit,
        offset,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      },
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Comments GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = requireNumber(req.params.id, 'id');
    const includeDeleted = parseOptionalBoolean(
      req.query.includeDeleted ?? req.query.include_deleted,
      'includeDeleted'
    );

    const comment = await fetchCommentById(scope, id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (includeDeleted !== true && comment.deletedAt) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ data: comment });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Comments GET by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, autoInjectMiddleware('comments'), async (req, res) => {
  try {
    const scope = getScopeFromRequest(req as any);
    const user = (req as any)?.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const entityType = coerceEntityType(req.body.entityType ?? req.body.entity_type);
    // Allow viewers to comment on todos (conversation/task threads). Keep other entity comments write-gated.
    if (scope.homeAccessRole === 'viewer' && entityType !== 'todo') {
      throw new ValidationError('Read-only access. Commenting not permitted for this entity.', 403);
    }
    const entityId = parseOptionalInteger(req.body.entityId ?? req.body.entity_id, 'entityId');
    if (entityId == null) {
      throw new ValidationError('entityId is required');
    }

    const parentCommentId = parseOptionalInteger(
      req.body.parentCommentId ?? req.body.parent_comment_id,
      'parentCommentId'
    );
    const { homeId } = await assertEntityContext(scope, entityType, entityId);
    const parentComment = parentCommentId != null ? await fetchCommentById(scope, parentCommentId) : null;
    if (parentCommentId != null) {
      if (!parentComment) {
        throw new ValidationError('parentCommentId not found', 404);
      }
      if (parentComment.entityType !== entityType || parentComment.entityId !== entityId) {
        throw new ValidationError('parentCommentId must reference the same entity');
      }
      if (parentComment.deletedAt) {
        throw new ValidationError('Cannot reply to a deleted comment');
      }
    }

    const commentBody = normalizeCommentBody(req.body.body ?? req.body.content ?? req.body.message);
    const subjectInput = sanitizeSubjectInput(req.body.subject ?? req.body.title ?? req.body.topic);
    const subject = subjectInput === undefined ? generateDefaultSubject(entityType, entityId) : subjectInput;
    const commentType = coerceCommentType(req.body.commentType ?? req.body.comment_type);
    if (commentType === 'system' && user.role !== 'admin') {
      throw new ValidationError('Only admins can create system comments', 403);
    }
    const visibility = coerceVisibility(req.body.visibility);
    const actorEmail = parseOptionalString(req.body.actorEmail ?? req.body.actor_email);
    const mentions = parseMentions(req.body.mentions);
    const metadata = parseOptionalJson(req.body.metadata, 'metadata');
    const hasAttachments = parseOptionalBoolean(
      req.body.hasAttachments ?? req.body.has_attachments,
      'hasAttachments'
    );
    const isSystemRequested = parseOptionalBoolean(req.body.isSystem ?? req.body.is_system, 'isSystem');
    const isSystem = isSystemRequested === true ? user.role === 'admin' : false;

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .insert(comments)
          .values({
            customerId: scope.customerId,
            homeId: parentComment?.homeId ?? homeId ?? null,
            entityType,
            entityId,
            parentCommentId: parentCommentId ?? null,
            commentType,
            visibility,
            authorUserId: user.id,
            actorEmail: actorEmail ?? null,
            subject,
            body: commentBody,
            mentions: mentions.length ? mentions : null,
            metadata: metadata ?? null,
            hasAttachments: hasAttachments ?? false,
            isSystem,
          })
          .returning();
      }
    );

    const created = rows[0];
    broadcastCommentChange('create', created, scope);
    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Comments POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleCommentUpdate(req: Request, res: Response) {
  try {
    const scope = await getRequestScope(req as any);
    const user = (req as any)?.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const id = requireNumber(req.params.id, 'id');
    const existing = await fetchCommentById(scope, id);
    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (existing.deletedAt) {
      return res.status(400).json({ error: 'Cannot edit a deleted comment' });
    }
    if (existing.authorUserId !== user.id && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    let hasChanges = false;

    if (req.body.body !== undefined || req.body.content !== undefined || req.body.message !== undefined) {
      updates.body = normalizeCommentBody(req.body.body ?? req.body.content ?? req.body.message);
      hasChanges = true;
    }

    if (
      req.body.subject !== undefined ||
      req.body.title !== undefined ||
      req.body.topic !== undefined
    ) {
      const subjectUpdate = sanitizeSubjectInput(req.body.subject ?? req.body.title ?? req.body.topic);
      if (subjectUpdate !== undefined) {
        updates.subject = subjectUpdate;
        hasChanges = true;
      }
    }

    if (req.body.visibility !== undefined) {
      updates.visibility = coerceVisibility(req.body.visibility);
      hasChanges = true;
    }

    if (req.body.commentType !== undefined || req.body.comment_type !== undefined) {
      const commentType = coerceCommentType(req.body.commentType ?? req.body.comment_type);
      if (commentType === 'system' && user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can set system comment type' });
      }
      updates.commentType = commentType;
      hasChanges = true;
    }

    if (req.body.metadata !== undefined) {
      updates.metadata = parseOptionalJson(req.body.metadata, 'metadata') ?? null;
      hasChanges = true;
    }

    if (req.body.mentions !== undefined) {
      const mentions = parseMentions(req.body.mentions);
      updates.mentions = mentions.length ? mentions : null;
      hasChanges = true;
    }

    if (!hasChanges) {
      return res.status(400).json({ error: 'No editable fields supplied' });
    }

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .update(comments)
          .set(updates)
          .where(and(eq(comments.customerId, scope.customerId), eq(comments.id, id)))
          .returning();
      }
    );

    const updated = rows[0];
    broadcastCommentChange('update', updated, scope);
    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Comments update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.patch('/:id', authenticateToken, async (req, res) => {
  await handleCommentUpdate(req, res);
});

router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  await handleCommentUpdate(req, res);
});

router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const user = (req as any)?.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const id = requireNumber(req.params.id, 'id');
    const existing = await fetchCommentById(scope, id);
    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (existing.authorUserId !== user.id && user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }
    if (existing.deletedAt) {
      return res.status(400).json({ error: 'Comment already deleted' });
    }

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .update(comments)
          .set({ deletedAt: new Date(), deletedByUserId: user.id, updatedAt: new Date() })
          .where(and(eq(comments.customerId, scope.customerId), eq(comments.id, id)))
          .returning();
      }
    );

    const deleted = rows[0];
    broadcastCommentChange('delete', deleted, scope);
    res.json({ data: deleted });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Comments DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

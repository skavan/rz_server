import { Router } from 'express';
import {
  todos,
  comments,
  mediaAssets,
  eq,
  and,
  or,
  inArray,
  isNull,
} from '@postgress/shared';
import { authenticateToken } from '../auth/index.js';
import { withTenantScope } from '../db/index.js';
import { getRequestScope } from '../utils/scope.js';
import { autoInjectMiddleware, getScopeFromRequest, requireWriteMiddleware } from '../utils/auto-inject-middleware.js';
import {
  ValidationError,
  parseOptionalInteger,
  parseOptionalString,
  parseOptionalDate,
  parseStringArray,
  ensureHomeAccess,
} from './shared/validation.js';

const router = Router();

const TODO_STATUS_VALUES = ['todo', 'in_progress', 'complete'] as const;
const TODO_PRIORITY_VALUES = ['low', 'high'] as const;
const TODO_TYPE_VALUES = ['todo', 'conversation'] as const;
const TODO_LINKED_ENTITY_TYPE_VALUES = [
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

type TodoStatus = (typeof TODO_STATUS_VALUES)[number];
type TodoPriority = (typeof TODO_PRIORITY_VALUES)[number];
type TodoType = (typeof TODO_TYPE_VALUES)[number];
type TodoLinkedEntityType = (typeof TODO_LINKED_ENTITY_TYPE_VALUES)[number];

function coerceStatus(value: unknown): TodoStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value) as TodoStatus;
  if (!TODO_STATUS_VALUES.includes(normalized)) {
    throw new ValidationError(`status must be one of ${TODO_STATUS_VALUES.join(', ')}`);
  }
  return normalized;
}

function coercePriority(value: unknown): TodoPriority | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value) as TodoPriority;
  if (!TODO_PRIORITY_VALUES.includes(normalized)) {
    throw new ValidationError(`priority must be one of ${TODO_PRIORITY_VALUES.join(', ')}`);
  }
  return normalized;
}

function coerceType(value: unknown): TodoType | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value) as TodoType;
  if (!TODO_TYPE_VALUES.includes(normalized)) {
    throw new ValidationError(`type must be one of ${TODO_TYPE_VALUES.join(', ')}`);
  }
  return normalized;
}

function coerceLinkedEntityType(value: unknown): TodoLinkedEntityType | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const normalized = String(value) as TodoLinkedEntityType;
  if (!TODO_LINKED_ENTITY_TYPE_VALUES.includes(normalized)) {
    throw new ValidationError(`linkedEntityType must be one of ${TODO_LINKED_ENTITY_TYPE_VALUES.join(', ')}`);
  }
  return normalized;
}

const parseTagIds = (value: unknown): number[] | null | undefined => {
  const parsed = parseStringArray(value, 'tags');
  if (parsed === undefined) return undefined;
  if (parsed === null) return null;
  return parsed.map((item) => {
    const num = Number(item);
    if (!Number.isFinite(num)) {
      throw new ValidationError('tags must be an array of integers');
    }
    return Math.trunc(num);
  });
};

const parseAssigneeIds = (value: unknown): number[] | null | undefined => {
  const parsed = parseStringArray(value, 'assignedToUserIds');
  if (parsed === undefined) return undefined;
  if (parsed === null) return null;

  const ids = parsed
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));

  // Normalize to unique + sorted for stable comparisons
  const uniqueSorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  return uniqueSorted;
};

function isAdmin(scope: { homeAccessRole: string }): boolean {
  return scope.homeAccessRole === 'admin';
}

function canEditMeta(params: {
  scope: { homeAccessRole: string };
  userId: number;
  todo: any;
}): boolean {
  const { scope, userId, todo } = params;
  if (isAdmin(scope)) return true;
  if (todo.createdByUserId != null && Number(todo.createdByUserId) === userId) return true;
  if (Array.isArray(todo.assignedToUserIds) && todo.assignedToUserIds.map(Number).includes(userId)) return true;
  return false;
}

function hasAssignees(todo: any): boolean {
  return Array.isArray(todo.assignedToUserIds) && todo.assignedToUserIds.length > 0;
}

function isAssignee(todo: any, userId: number): boolean {
  if (!Array.isArray(todo.assignedToUserIds)) return false;
  return todo.assignedToUserIds.map(Number).includes(userId);
}

async function createSystemTodoComment(params: {
  scopedDb: any;
  customerId: number;
  homeId: number;
  todoId: number;
  actorUserId: number;
  body: string;
}): Promise<void> {
  const { scopedDb, customerId, homeId, todoId, actorUserId, body } = params;
  await scopedDb.insert(comments).values({
    customerId,
    homeId,
    entityType: 'todo',
    entityId: todoId,
    parentCommentId: null,
    commentType: 'system',
    visibility: 'tenant',
    authorUserId: actorUserId,
    actorEmail: null,
    subject: `Todo #${todoId}`,
    body,
    mentions: null,
    metadata: null,
    hasAttachments: false,
    isSystem: true,
  });
}

/**
 * POST /api/todos
 * Create a todo (conversation/task)
 */
router.post('/', authenticateToken, autoInjectMiddleware('todos', { requireWrite: true }), async (req, res) => {
  try {
    const scope = getScopeFromRequest(req as any);
    const user = (req as any)?.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const title = parseOptionalString(req.body.title);
    if (!title) {
      throw new ValidationError('title is required');
    }

    const body = req.body.body !== undefined ? parseOptionalString(req.body.body) : undefined;
    const bodyValue = body === undefined ? '' : body ?? '';

    const homeId = parseOptionalInteger(req.body.homeId ?? req.body.home_id, 'homeId');
    if (homeId == null) {
      throw new ValidationError('homeId is required');
    }
    ensureHomeAccess(scope, homeId);

    const assignedToUserIds =
      req.body.assignedToUserIds !== undefined
        ? parseAssigneeIds(req.body.assignedToUserIds)
        : req.body.assignedToUserId !== undefined
          ? parseAssigneeIds([req.body.assignedToUserId])
          : undefined;

    const type = coerceType(req.body.type);
    const status = coerceStatus(req.body.status);
    const priority = coercePriority(req.body.priority);

    const dueAt = req.body.dueAt !== undefined ? parseOptionalDate(req.body.dueAt, 'dueAt') : undefined;
    const tags = req.body.tags !== undefined ? parseTagIds(req.body.tags) : undefined;

    const linkedEntityType = req.body.linkedEntityType !== undefined ? coerceLinkedEntityType(req.body.linkedEntityType) : undefined;
    const linkedEntityId =
      req.body.linkedEntityId !== undefined
        ? parseOptionalInteger(req.body.linkedEntityId, 'linkedEntityId')
        : undefined;

    if (linkedEntityType !== undefined || linkedEntityId !== undefined) {
      const t = linkedEntityType === undefined ? null : linkedEntityType;
      const i = linkedEntityId === undefined ? null : linkedEntityId;
      const clearing = t === null && i === null;
      if (!clearing) {
        if (!t) throw new ValidationError('linkedEntityType is required when linkedEntityId is provided');
        if (i == null) throw new ValidationError('linkedEntityId is required when linkedEntityType is provided');
      }
    }

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      return scopedDb
        .insert(todos)
        .values({
          customerId: scope.customerId,
          homeId,
          title,
          body: bodyValue,
          assignedToUserIds: assignedToUserIds ?? null,
          dueAt: dueAt ?? null,
          type: type ?? 'todo',
          status: status ?? 'todo',
          priority: priority ?? 'low',
          completedAt: null,
          completedByUserId: null,
          tags: tags ?? null,

          linkedEntityType: linkedEntityType === undefined ? null : linkedEntityType,
          linkedEntityId: linkedEntityId === undefined ? null : linkedEntityId,
          createdByUserId: Number(user.id),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    });

    res.status(201).json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Todos POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/todos/:id
 * Update todo fields and handle complete/reopen
 */
router.patch('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const user = (req as any)?.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid todo id');
    }

    if (
      'customerId' in (req.body ?? {}) ||
      'homeId' in (req.body ?? {}) ||
      'createdByUserId' in (req.body ?? {}) ||
      'created_by_user_id' in (req.body ?? {})
    ) {
      throw new ValidationError('Tenant fields cannot be modified');
    }
    if ('completedAt' in (req.body ?? {}) || 'completedByUserId' in (req.body ?? {})) {
      throw new ValidationError('Completion fields are server-controlled');
    }
    if ('deletedAt' in (req.body ?? {}) || 'deletedByUserId' in (req.body ?? {}) || 'deleted_at' in (req.body ?? {})) {
      throw new ValidationError('Delete fields are server-controlled');
    }

    const status = coerceStatus(req.body.status);
    const type = coerceType(req.body.type);
    const priority = coercePriority(req.body.priority);
    const title = req.body.title !== undefined ? parseOptionalString(req.body.title) : undefined;
    const body = req.body.body !== undefined ? parseOptionalString(req.body.body) : undefined;
    const assignedToUserIds =
      req.body.assignedToUserIds !== undefined
        ? parseAssigneeIds(req.body.assignedToUserIds)
        : req.body.assignedToUserId !== undefined
          ? parseAssigneeIds([req.body.assignedToUserId])
          : undefined;
    const dueAt = req.body.dueAt !== undefined ? parseOptionalDate(req.body.dueAt, 'dueAt') : undefined;
    const tags = req.body.tags !== undefined ? parseTagIds(req.body.tags) : undefined;

    const linkedEntityType = req.body.linkedEntityType !== undefined ? coerceLinkedEntityType(req.body.linkedEntityType) : undefined;
    const linkedEntityId =
      req.body.linkedEntityId !== undefined
        ? parseOptionalInteger(req.body.linkedEntityId, 'linkedEntityId')
        : undefined;

    if (linkedEntityType !== undefined || linkedEntityId !== undefined) {
      const t = linkedEntityType === undefined ? null : linkedEntityType;
      const i = linkedEntityId === undefined ? null : linkedEntityId;
      const clearing = t === null && i === null;
      if (!clearing) {
        if (!t) throw new ValidationError('linkedEntityType is required when linkedEntityId is provided');
        if (i == null) throw new ValidationError('linkedEntityId is required when linkedEntityType is provided');
      }
    }

    const actorUserId = Number(user.id);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereParts: any[] = [eq(todos.id, id), eq(todos.customerId, scope.customerId), isNull(todos.deletedAt)];
      if (Array.isArray(scope.homeIds) && scope.homeIds.length > 0) {
        whereParts.push(inArray(todos.homeId, scope.homeIds));
      }

      const existing = await scopedDb
        .select()
        .from(todos)
        .where(and(...whereParts))
        .limit(1);

      if (existing.length === 0) return [];
      const current = existing[0];

      ensureHomeAccess(scope, current.homeId);

      const canEdit = canEditMeta({ scope, userId: actorUserId, todo: current });
      if (!canEdit) {
        throw new ValidationError('Forbidden', 403);
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      const systemNotes: string[] = [];

      if (title !== undefined) updateData.title = title ?? '';
      if (body !== undefined) updateData.body = body ?? '';

      if (assignedToUserIds !== undefined) {
        const prevArr: number[] | null = Array.isArray(current.assignedToUserIds)
          ? (() => {
              const prevRaw: number[] = (current.assignedToUserIds as unknown[])
                .map((v) => Number(v))
                .filter((n) => Number.isFinite(n))
                .map((n) => Math.trunc(n));
              return Array.from(new Set<number>(prevRaw)).sort((a, b) => a - b);
            })()
          : null;
        const nextArr = assignedToUserIds;

        const prevKey = prevArr ? prevArr.join(',') : '';
        const nextKey = nextArr ? nextArr.join(',') : '';

        if (prevKey !== nextKey) {
          updateData.assignedToUserIds = nextArr;
          systemNotes.push(`**Assigned** to ${nextArr && nextArr.length ? `users ${nextArr.join(', ')}` : 'unassigned'}`);
        }
      }

      if (dueAt !== undefined) {
        const prev = current.dueAt ? new Date(current.dueAt).toISOString() : null;
        const next = dueAt ? dueAt.toISOString() : null;
        if (next !== prev) {
          updateData.dueAt = dueAt;
          systemNotes.push(`**Due** changed to ${next ?? 'none'}`);
        }
      }

      if (tags !== undefined) {
        updateData.tags = tags;
      }

      if (linkedEntityType !== undefined || linkedEntityId !== undefined) {
        const nextType = linkedEntityType === undefined ? (current.linkedEntityType ?? null) : linkedEntityType;
        const nextId = linkedEntityId === undefined ? (current.linkedEntityId ?? null) : linkedEntityId;

        const prevType = current.linkedEntityType ?? null;
        const prevId = current.linkedEntityId ?? null;

        if (nextType !== prevType || nextId !== prevId) {
          updateData.linkedEntityType = nextType;
          updateData.linkedEntityId = nextId;
          if (nextType && nextId != null) {
            systemNotes.push(`**Linked** to ${String(nextType)} #${String(nextId)}`);
          } else {
            systemNotes.push('**Unlinked** from entity');
          }
        }
      }

      if (type !== undefined) {
        if (type !== current.type) {
          updateData.type = type;
          systemNotes.push(`**Type** set to ${type}`);
        }
      }

      if (priority !== undefined) {
        if (priority !== current.priority) {
          updateData.priority = priority;
          systemNotes.push(`**Priority** set to ${priority}`);
        }
      }

      // Status transitions also drive completedAt/completedByUserId.
      if (status !== undefined) {
        if (status !== current.status) {
          // Reopen/un-complete: admin-only
          if (current.status === 'complete' && status !== 'complete' && !isAdmin(scope)) {
            throw new ValidationError('Only admins can reopen todos', 403);
          }

          // Completing: enforce assignment/creator rules
          if (status === 'complete') {
            const isCreator = current.createdByUserId != null && Number(current.createdByUserId) === actorUserId;
            if (hasAssignees(current)) {
              if (!isAssignee(current, actorUserId)) {
                throw new ValidationError('Only an assignee can complete this todo', 403);
              }
            } else {
              if (!isCreator && !isAdmin(scope)) {
                throw new ValidationError('Only the creator can complete this todo', 403);
              }
            }
            updateData.completedAt = new Date();
            updateData.completedByUserId = actorUserId;
          } else {
            // Not complete => clear completion markers
            updateData.completedAt = null;
            updateData.completedByUserId = null;
          }

          updateData.status = status;
          systemNotes.push(`**Status** set to ${status}`);
        }
      }

      const updated = await scopedDb
        .update(todos)
        .set(updateData)
        .where(and(...whereParts))
        .returning();

      const updatedRow = updated[0];

      if (systemNotes.length > 0) {
        await createSystemTodoComment({
          scopedDb,
          customerId: scope.customerId,
          homeId: updatedRow.homeId,
          todoId: updatedRow.id,
          actorUserId,
          body: systemNotes.join('\n'),
        });
      }

      return updated;
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Todos PATCH error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/todos/:id
 * Soft-delete a todo (sets deletedAt/deletedByUserId)
 */
router.delete('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const user = (req as any)?.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new ValidationError('Invalid todo id');
    }

    const actorUserId = Number(user.id);

    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const whereParts: any[] = [eq(todos.id, id), eq(todos.customerId, scope.customerId), isNull(todos.deletedAt)];
      if (Array.isArray(scope.homeIds) && scope.homeIds.length > 0) {
        whereParts.push(inArray(todos.homeId, scope.homeIds));
      }

      const existing = await scopedDb.select().from(todos).where(and(...whereParts)).limit(1);
      if (existing.length === 0) return [];
      const current = existing[0];

      ensureHomeAccess(scope, current.homeId);

      // Admin-only deletion (home admin role).
      if (!isAdmin(scope)) {
        throw new ValidationError('Forbidden', 403);
      }

      // Fetch all related comments (including already-deleted ones, so we can also deactivate their media).
      const relatedComments = await scopedDb
        .select({ id: comments.id, deletedAt: comments.deletedAt })
        .from(comments)
        .where(and(eq(comments.customerId, scope.customerId), eq(comments.entityType, 'todo' as any), eq(comments.entityId, id)));

      const relatedCommentIds = relatedComments.map((c: { id: number }) => c.id);

      // Soft-delete any not-yet-deleted comments.
      if (relatedCommentIds.length > 0) {
        await scopedDb
          .update(comments)
          .set({ deletedAt: new Date(), deletedByUserId: actorUserId, updatedAt: new Date(), hasAttachments: false })
          .where(
            and(
              eq(comments.customerId, scope.customerId),
              inArray(comments.id, relatedCommentIds),
              isNull(comments.deletedAt)
            )
          );
      }

      // Soft-deactivate media assets for the todo itself.
      await scopedDb
        .update(mediaAssets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(mediaAssets.customerId, scope.customerId),
            eq(mediaAssets.entityType, 'todo' as any),
            eq(mediaAssets.entityId, id)
          )
        );

      // Soft-deactivate media assets for any related comments.
      if (relatedCommentIds.length > 0) {
        await scopedDb
          .update(mediaAssets)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(mediaAssets.customerId, scope.customerId),
              eq(mediaAssets.entityType, 'comment' as any),
              inArray(mediaAssets.entityId, relatedCommentIds)
            )
          );
      }

      const updated = await scopedDb
        .update(todos)
        .set({
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          hasMediaAssets: false,
          updatedAt: new Date(),
        })
        .where(and(...whereParts))
        .returning();

      return updated;
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    return res.json({ data: rows[0] });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Todos DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router } from 'express';
import {
  issues,
  inventoryItems,
  locations,
  homes,
  products,
  skus,
  eq,
  and,
  ilike,
  asc,
  desc,
  isNull,
} from '@postgress/shared';
import { authenticateToken, optionalAuth } from '../auth/index.js';
import { withTenantScope } from '../db/index.js';
import { getRequestScope } from '../utils/scope.js';
import type { RequestScope } from '../utils/scope.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';
import {
  ValidationError,
  parseOptionalInteger,
  parseOptionalString,
  parseOptionalDate,
  parseOptionalBoolean,
  ensureHomeAccess,
  parsePagination,
  parseStringArray,
} from './shared/validation.js';

const router = Router();
const ISSUE_STATUS_VALUES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;
type IssueStatus = (typeof ISSUE_STATUS_VALUES)[number];
const ISSUE_STATUS_SET = new Set<IssueStatus>(ISSUE_STATUS_VALUES);

const ISSUE_URGENCY_VALUES = ['normal', 'high'] as const;
type IssueUrgency = (typeof ISSUE_URGENCY_VALUES)[number];
const ISSUE_URGENCY_SET = new Set<IssueUrgency>(ISSUE_URGENCY_VALUES);

const ISSUE_TYPE_VALUES = ['operational', 'cosmetic', 'safety', 'supplies'] as const;
type IssueType = (typeof ISSUE_TYPE_VALUES)[number];
const ISSUE_TYPE_SET = new Set<IssueType>(ISSUE_TYPE_VALUES);

const ISSUE_ACTION_VALUES = ['none', 'repair', 'replace', 'inspect'] as const;
type IssueAction = (typeof ISSUE_ACTION_VALUES)[number];
const ISSUE_ACTION_SET = new Set<IssueAction>(ISSUE_ACTION_VALUES);

const ISSUE_DAMAGE_ASSESSMENT_VALUES = ['none', 'minor', 'major'] as const;
type IssueDamageAssessment = (typeof ISSUE_DAMAGE_ASSESSMENT_VALUES)[number];
const ISSUE_DAMAGE_ASSESSMENT_SET = new Set<IssueDamageAssessment>(ISSUE_DAMAGE_ASSESSMENT_VALUES);

const ISSUE_ENTITY_TYPE_VALUES = ['inventory_item', 'location', 'home', 'product', 'sku'] as const;
type IssueEntityType = (typeof ISSUE_ENTITY_TYPE_VALUES)[number];
const ISSUE_ENTITY_TYPE_SET = new Set<IssueEntityType>(ISSUE_ENTITY_TYPE_VALUES);

const coerceStatus = (value: unknown, field: string): IssueStatus | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const status = String(value) as IssueStatus;
  if (!ISSUE_STATUS_SET.has(status)) {
    throw new ValidationError(`${field} must be one of ${ISSUE_STATUS_VALUES.join(', ')}`);
  }
  return status;
};

const coerceUrgency = (value: unknown, field: string): IssueUrgency | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const urgency = String(value) as IssueUrgency;
  if (!ISSUE_URGENCY_SET.has(urgency)) {
    throw new ValidationError(`${field} must be one of ${ISSUE_URGENCY_VALUES.join(', ')}`);
  }
  return urgency;
};

const coerceIssueType = (value: unknown, field: string): IssueType | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const issueType = String(value) as IssueType;
  if (!ISSUE_TYPE_SET.has(issueType)) {
    throw new ValidationError(`${field} must be one of ${ISSUE_TYPE_VALUES.join(', ')}`);
  }
  return issueType;
};

const coerceRecommendedAction = (value: unknown, field: string): IssueAction | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const action = String(value) as IssueAction;
  if (!ISSUE_ACTION_SET.has(action)) {
    throw new ValidationError(`${field} must be one of ${ISSUE_ACTION_VALUES.join(', ')}`);
  }
  return action;
};

const coerceEntityType = (value: unknown): IssueEntityType => {
  const entityType = String(value) as IssueEntityType;
  if (!ISSUE_ENTITY_TYPE_SET.has(entityType)) {
    throw new ValidationError(`entityType must be one of ${ISSUE_ENTITY_TYPE_VALUES.join(', ')}`);
  }
  return entityType;
};

const coerceDamageAssessment = (
  value: unknown,
  field: string
): IssueDamageAssessment | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const assessment = String(value) as IssueDamageAssessment;
  if (!ISSUE_DAMAGE_ASSESSMENT_SET.has(assessment)) {
    throw new ValidationError(`${field} must be one of ${ISSUE_DAMAGE_ASSESSMENT_VALUES.join(', ')}`);
  }
  return assessment;
};

const resolveBooleanOrDefault = (
  value: boolean | null | undefined,
  field: string,
  defaultValue: boolean
): boolean => {
  if (value === undefined) return defaultValue;
  if (value === null) {
    throw new ValidationError(`${field} must be a boolean`);
  }
  return value;
};

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

type EntityResolution = { exists: boolean; homeId: number | null };

async function resolveEntity(
  scopedDb: any,
  entityType: IssueEntityType,
  entityId: number
): Promise<EntityResolution> {
  switch (entityType) {
    case 'inventory_item': {
      const rows = await scopedDb
        .select({ homeId: inventoryItems.homeId })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, entityId))
        .limit(1);
      if (rows.length === 0) return { exists: false, homeId: null };
      return { exists: true, homeId: rows[0].homeId ?? null };
    }
    case 'location': {
      const rows = await scopedDb
        .select({ homeId: locations.homeId })
        .from(locations)
        .where(eq(locations.id, entityId))
        .limit(1);
      if (rows.length === 0) return { exists: false, homeId: null };
      return { exists: true, homeId: rows[0].homeId ?? null };
    }
    case 'home': {
      const rows = await scopedDb
        .select({ id: homes.id })
        .from(homes)
        .where(eq(homes.id, entityId))
        .limit(1);
      if (rows.length === 0) return { exists: false, homeId: null };
      return { exists: true, homeId: rows[0].id };
    }
    case 'product': {
      const rows = await scopedDb
        .select({ homeId: products.homeId })
        .from(products)
        .where(eq(products.id, entityId))
        .limit(1);
      if (rows.length === 0) return { exists: false, homeId: null };
      return { exists: true, homeId: rows[0].homeId ?? null };
    }
    case 'sku': {
      const skuRows = await scopedDb
        .select({ productId: skus.productId })
        .from(skus)
        .where(eq(skus.id, entityId))
        .limit(1);
      if (skuRows.length === 0) return { exists: false, homeId: null };
      const productId = skuRows[0].productId;
      if (productId == null) return { exists: false, homeId: null };
      const productRows = await scopedDb
        .select({ homeId: products.homeId })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (productRows.length === 0) return { exists: false, homeId: null };
      return { exists: true, homeId: productRows[0].homeId ?? null };
    }
    default:
      return { exists: false, homeId: null };
  }
}

async function touchInventoryItemLastChecked(scope: RequestScope, inventoryId: number): Promise<void> {
  await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
    await scopedDb
      .update(inventoryItems)
      .set({ lastChecked: new Date(), markedGoodDate: null, updatedAt: new Date() })
      .where(eq(inventoryItems.id, inventoryId));
  });
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      status,
      urgency,
      issue_type,
      damage_assessment,
      damageAssessment: camelDamageAssessment,
      entity_type,
      entity_id,
      home_id,
      has_visible_damage,
      hasVisibleDamage: camelVisibleDamage,
      assigned_to_user_id,
      reported_by_user_id,
      search,
      limit,
      offset,
      sort = 'reportedAt',
      order = 'desc',
      include_deleted,
      includeDeleted,
    } = req.query as Record<string, string | undefined>;

    const scope = await getRequestScope(req as any);

    const filters: any[] = [eq(issues.customerId, scope.customerId)];
    const includeDeletedRaw = include_deleted ?? includeDeleted;
    const includeDeletedFlag =
      includeDeletedRaw !== undefined
        ? parseOptionalBoolean(includeDeletedRaw, 'includeDeleted')
        : undefined;
    if (includeDeletedFlag !== true) {
      filters.push(isNull(issues.deletedAt));
    }

    const statusFilter = status ? coerceStatus(status, 'status') : undefined;
    if (statusFilter) filters.push(eq(issues.status, statusFilter));

    const urgencyFilter = urgency ? coerceUrgency(urgency, 'urgency') : undefined;
    if (urgencyFilter) filters.push(eq(issues.urgency, urgencyFilter));

    const typeFilter = issue_type ? coerceIssueType(issue_type, 'issue_type') : undefined;
    if (typeFilter) filters.push(eq(issues.issueType, typeFilter));

    const damageAssessmentFilter = coerceDamageAssessment(
      damage_assessment ?? camelDamageAssessment,
      'damageAssessment'
    );
    if (damageAssessmentFilter !== undefined) {
      filters.push(eq(issues.damageAssessment, damageAssessmentFilter));
    }

    if (entity_type) filters.push(eq(issues.entityType, coerceEntityType(entity_type)));

    const entityIdFilter = parseOptionalInteger(entity_id, 'entity_id');
    if (entityIdFilter != null) filters.push(eq(issues.entityId, entityIdFilter));

    const homeFilter = parseOptionalInteger(home_id, 'home_id');
    if (homeFilter != null) filters.push(eq(issues.homeId, homeFilter));

    const visibleDamageQuery = has_visible_damage ?? camelVisibleDamage;
    const visibleDamageFilter = parseOptionalBoolean(visibleDamageQuery, 'hasVisibleDamage');
    if (visibleDamageFilter !== undefined && visibleDamageFilter !== null) {
      filters.push(eq(issues.hasVisibleDamage, visibleDamageFilter));
    }

    const assignedFilter = parseOptionalInteger(assigned_to_user_id, 'assigned_to_user_id');
    if (assignedFilter != null) filters.push(eq(issues.assignedToUserId, assignedFilter));

    const reportedFilter = parseOptionalInteger(reported_by_user_id, 'reported_by_user_id');
    if (reportedFilter != null) filters.push(eq(issues.reportedByUserId, reportedFilter));

    if (search) {
      const text = `%${search}%`;
      filters.push(ilike(issues.description, text));
    }

    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    const sortColumn = (() => {
      switch (sort) {
        case 'urgency':
          return issues.urgency;
        case 'status':
          return issues.status;
        case 'updatedAt':
          return issues.updatedAt;
        case 'assignedToUserId':
          return issues.assignedToUserId;
        default:
          return issues.reportedAt;
      }
    })();

    const orderBy = order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const { limit: parsedLimit, offset: parsedOffset } = parsePagination(limit, offset);

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        return scopedDb
          .select()
          .from(issues)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(parsedLimit)
          .offset(parsedOffset);
      }
    );

    res.json({
      data: rows,
      meta: {
        count: rows.length,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Issues GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = parseInt(req.params.id, 10);
    const includeDeletedRaw = (req.query?.include_deleted ?? req.query?.includeDeleted) as
      | string
      | undefined;
    const includeDeletedFlag =
      includeDeletedRaw !== undefined
        ? parseOptionalBoolean(includeDeletedRaw, 'includeDeleted')
        : undefined;

    const rows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const predicates: any[] = [eq(issues.id, id), eq(issues.customerId, scope.customerId)];
        if (includeDeletedFlag !== true) {
          predicates.push(isNull(issues.deletedAt));
        }
        return scopedDb
          .select()
          .from(issues)
          .where(and(...predicates))
          .limit(1);
      }
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json({ data: rows[0] });
  } catch (error: any) {
    console.error('Issues GET by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, autoInjectMiddleware('issues'), async (req, res) => {
  try {
    const scope = getScopeFromRequest(req as any);
    const body = req.body ?? {};
    const entityType = coerceEntityType(body.entityType);

    const description = parseOptionalString(body.description);
    if (!description) {
      throw new ValidationError('description is required');
    }

    const entityId = parseOptionalInteger(body.entityId, 'entityId');
    if (entityId == null) {
      throw new ValidationError('entityId is required');
    }

    const assignedTo = parseOptionalInteger(body.assignedToUserId, 'assignedToUserId');
    const reportedBy = (req as any).user?.id ? Number((req as any).user.id) : undefined;
    const dueAt = parseOptionalDate(body.dueAt, 'dueAt');

    const status = coerceStatus(body.status, 'status') ?? 'open';
    const urgency = coerceUrgency(body.urgency, 'urgency') ?? 'normal';
    const issueType = coerceIssueType(body.issueType, 'issueType') ?? 'operational';
    const recommendedAction = coerceRecommendedAction(body.recommendedAction, 'recommendedAction') ?? 'none';

    const rawVisibleDamage =
      body.hasVisibleDamage ??
      body.visibleDamage ??
      body.has_visible_damage ??
      body.visible_damage;
    const parsedVisibleDamage = parseOptionalBoolean(rawVisibleDamage, 'hasVisibleDamage');
    const hasVisibleDamage = resolveBooleanOrDefault(parsedVisibleDamage, 'hasVisibleDamage', false);

    const damageAssessment =
      coerceDamageAssessment(body.damageAssessment ?? body.damage_assessment, 'damageAssessment') ?? 'none';

    const explicitHomeId = parseOptionalInteger(body.homeId, 'homeId');
    const tags = parseTagIds(body.tags);

    const createdRows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const entity = await resolveEntity(scopedDb, entityType, entityId);
        if (!entity.exists) {
          throw new ValidationError('Entity not found or inaccessible', 404);
        }

        let homeId = explicitHomeId ?? entity.homeId;
        if (explicitHomeId != null && entity.homeId != null && explicitHomeId !== entity.homeId) {
          throw new ValidationError('homeId does not match the linked entity');
        }
        if (homeId == null) {
          throw new ValidationError('Unable to determine home for issue');
        }

        ensureHomeAccess(scope, homeId);

        if (entityType === 'inventory_item') {
          const existingInventoryIssue = await scopedDb
            .select({ id: issues.id })
            .from(issues)
            .where(
              and(
                eq(issues.customerId, scope.customerId),
                eq(issues.entityType, 'inventory_item'),
                eq(issues.entityId, entityId),
                isNull(issues.deletedAt)
              )
            )
            .limit(1);

          if (existingInventoryIssue.length > 0) {
            throw new ValidationError('An issue already exists for this inventory item', 409);
          }
        }

        return scopedDb
          .insert(issues)
          .values({
            customerId: scope.customerId,
            homeId,
            entityType,
            entityId,
            status,
            urgency,
            issueType,
            description,
            recommendedAction,
            hasVisibleDamage,
            damageAssessment,
            assignedToUserId: assignedTo ?? null,
            reportedByUserId: reportedBy ?? null,
            dueAt: dueAt ?? null,
            tags: tags ?? null,
          })
          .returning();
      }
    );

    const created = createdRows[0];

    if (created.entityType === 'inventory_item') {
      await touchInventoryItemLastChecked(scope, created.entityId);
    }

    eventBus.broadcast({
      event: 'data_change:issues',
      data: { type: 'create', resource: 'issues', resourceId: created.id, data: created },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: created.customerId, homeIds: created.homeId ? [created.homeId] : [] },
      },
    });

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Issue POST error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scope = await getRequestScope(req as any);

    const body = req.body ?? {};

    if ('entityType' in body || 'entityId' in body || 'customerId' in body || 'homeId' in body) {
      throw new ValidationError('Entity linkage fields cannot be modified');
    }

    const status = coerceStatus(body.status, 'status');
    const urgency = coerceUrgency(body.urgency, 'urgency');
    const issueType = coerceIssueType(body.issueType, 'issueType');
    const recommendedAction = coerceRecommendedAction(body.recommendedAction, 'recommendedAction');
    const description = body.description !== undefined ? parseOptionalString(body.description) : undefined;
    const resolutionNote = body.resolutionNote !== undefined ? parseOptionalString(body.resolutionNote) : undefined;
    const assignedTo = body.assignedToUserId !== undefined ? parseOptionalInteger(body.assignedToUserId, 'assignedToUserId') : undefined;
    const dueAt = body.dueAt !== undefined ? parseOptionalDate(body.dueAt, 'dueAt') : undefined;
    const resolvedAt = body.resolvedAt !== undefined ? parseOptionalDate(body.resolvedAt, 'resolvedAt') : undefined;
    const resolvedBy = body.resolvedByUserId !== undefined ? parseOptionalInteger(body.resolvedByUserId, 'resolvedByUserId') : undefined;
    const tags = body.tags !== undefined ? parseTagIds(body.tags) : undefined;
    const rawVisibleDamageUpdate =
      body.hasVisibleDamage ??
      body.visibleDamage ??
      body.has_visible_damage ??
      body.visible_damage;
    const hasVisibleDamageUpdate =
      rawVisibleDamageUpdate !== undefined
        ? parseOptionalBoolean(rawVisibleDamageUpdate, 'hasVisibleDamage')
        : undefined;
    if (hasVisibleDamageUpdate === null) {
      throw new ValidationError('hasVisibleDamage must be a boolean');
    }

    const hasDamageAssessmentValue =
      body.damageAssessment !== undefined || body.damage_assessment !== undefined;
    const damageAssessmentUpdate = hasDamageAssessmentValue
      ? coerceDamageAssessment(body.damageAssessment ?? body.damage_assessment, 'damageAssessment')
      : undefined;

    const updatedRows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const existingRows = await scopedDb
          .select()
          .from(issues)
          .where(and(eq(issues.id, id), eq(issues.customerId, scope.customerId), isNull(issues.deletedAt)))
          .limit(1);

        if (existingRows.length === 0) {
          return [];
        }

        const updateData: Record<string, any> = { updatedAt: new Date() };

        if (status !== undefined) {
          updateData.status = status;
          if (status === 'resolved' && resolvedAt === undefined) {
            updateData.resolvedAt = new Date();
          }
          if (status === 'resolved' && resolvedBy === undefined) {
            const userId = (req as any).user?.id ? Number((req as any).user.id) : null;
            updateData.resolvedByUserId = userId;
          }
          if (status !== 'resolved' && resolvedAt === undefined) {
            updateData.resolvedAt = null;
            updateData.resolvedByUserId = resolvedBy !== undefined ? resolvedBy : null;
          }
        }

        if (urgency !== undefined) updateData.urgency = urgency;
        if (issueType !== undefined) updateData.issueType = issueType;
        if (recommendedAction !== undefined) updateData.recommendedAction = recommendedAction;
        if (description !== undefined) updateData.description = description;
        if (resolutionNote !== undefined) updateData.resolutionNote = resolutionNote;
        if (assignedTo !== undefined) updateData.assignedToUserId = assignedTo;
        if (dueAt !== undefined) updateData.dueAt = dueAt;
        if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt;
        if (resolvedBy !== undefined) updateData.resolvedByUserId = resolvedBy;
        if (tags !== undefined) updateData.tags = tags;
        if (hasVisibleDamageUpdate !== undefined) updateData.hasVisibleDamage = hasVisibleDamageUpdate;
        if (damageAssessmentUpdate !== undefined) {
          updateData.damageAssessment = damageAssessmentUpdate;
        }

        if (Object.keys(updateData).length === 1) {
          return existingRows; // Nothing to update beyond updatedAt fallback
        }

        const rows = await scopedDb
          .update(issues)
          .set(updateData)
          .where(and(eq(issues.id, id), eq(issues.customerId, scope.customerId), isNull(issues.deletedAt)))
          .returning();
        return rows;
      }
    );

    if (updatedRows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const updated = updatedRows[0];

    if (updated.entityType === 'inventory_item') {
      await touchInventoryItemLastChecked(scope, updated.entityId);
    }

    eventBus.broadcast({
      event: 'data_change:issues',
      data: { type: 'update', resource: 'issues', resourceId: updated.id, data: updated },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: updated.customerId, homeIds: updated.homeId ? [updated.homeId] : [] },
      },
    });

    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Issue PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const id = parseInt(req.params.id, 10);
    const deletedBy = (req as any).user?.id ? Number((req as any).user.id) : null;

    const deletedRows = await withTenantScope(
      { customerId: scope.customerId, homeIds: scope.homeIds },
      async (scopedDb) => {
        const existingRows = await scopedDb
          .select()
          .from(issues)
          .where(and(eq(issues.id, id), eq(issues.customerId, scope.customerId), isNull(issues.deletedAt)))
          .limit(1);

        if (existingRows.length === 0) {
          return [];
        }

        const deletedAt = new Date();

        await scopedDb
          .update(issues)
          .set({
            deletedAt,
            deletedByUserId: deletedBy,
            updatedAt: deletedAt,
          })
          .where(and(eq(issues.id, id), eq(issues.customerId, scope.customerId), isNull(issues.deletedAt)));

        const deletedRow = {
          ...existingRows[0],
          deletedAt,
          deletedByUserId: deletedBy,
          updatedAt: deletedAt,
        } as typeof issues.$inferSelect;

        return [deletedRow];
      }
    );

    if (deletedRows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const deleted = deletedRows[0];

    eventBus.broadcast({
      event: 'data_change:issues',
      data: { type: 'delete', resource: 'issues', resourceId: deleted.id, data: deleted },
      meta: {
        timestamp: Date.now(),
        source: 'api',
        audience: { customerId: deleted.customerId, homeIds: deleted.homeId ? [deleted.homeId] : [] },
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Issue DELETE error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

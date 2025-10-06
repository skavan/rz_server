import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { sql } from '@postgress/shared';
import { optionalAuth } from '../auth/index.js';
import { getRequestScope } from '../utils/scope.js';

const router = Router();

// GET /api/categories - tenant-scoped categories, camelCase fields
router.get('/', optionalAuth, async (req, res) => {
  try {
    const scope = await getRequestScope(req as any);
    const rows = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
      const result = await scopedDb.execute(sql`
        SELECT id, name, parent_id AS "parentId"
        FROM categories
        WHERE customer_id = ${scope.customerId}
        LIMIT 1000
      `);
      return result.rows as any[];
    });
    res.json({ data: rows, count: rows.length });
  } catch (error: any) {
    console.error('Categories GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

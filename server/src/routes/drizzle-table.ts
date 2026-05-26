/**
 * Drizzle Table API - Returns Drizzle-shaped data (camelCase)
 * Uses raw SQL + field transformation for maximum flexibility while maintaining type consistency
 */
import { Router } from "express";
import { db, withTenantScope } from "../db/index.js";
import { sql } from "@skavan/rentalzen-drizzle";
import { optionalAuth } from "../auth/index.js";
import { transformRows } from "../utils/field-transformer.js";
import { getRequestScope } from "../utils/scope.js";
import { getTablePolicy } from "../utils/policy-registry.js";
import { ENV_DEFAULT_LIMIT } from "./shared/validation.js";

const router = Router();

/**
 * GET /api/table
 * Get list of available tables from the database
 */
router.get("/", optionalAuth, async (req, res) => {
	try {
		const enforce = process.env.ENFORCE_AUTH === 'true' || process.env.NODE_ENV === 'production';
		if (enforce && !(req as any).user) {
			return res.status(401).json({ error: 'Authentication required' });
		}
		// Query the database for all user tables (excluding system tables)
		const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE 'sql_%'
      ORDER BY table_name
    `);

		const tables = result.rows.map((row: any) => row.table_name);

		res.json({
			count: tables.length,
			tables: tables,
		});
	} catch (error: any) {
		console.error("Tables list fetch error:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

/**
 * Dynamic Table API Endpoint
 * GET /api/table/:tableName - Query any table using raw SQL + field transformation
 * Always returns camelCase field names regardless of database schema
 */
router.get("/:tableName", optionalAuth, async (req, res) => {
	try {
		const enforce = process.env.ENFORCE_AUTH === 'true' || process.env.NODE_ENV === 'production';
		if (enforce && !(req as any).user) {
			return res.status(401).json({ error: 'Authentication required' });
		}
		const { tableName } = req.params;

		// Validate table name to prevent SQL injection
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
			return res.status(400).json({ error: "Invalid table name" });
		}

		// First verify the table exists in the database (no tenant data here)
	const tableExists = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name = ${tableName}
    `);

		if (tableExists.rows.length === 0) {
			return res.status(404).json({ error: `Table '${tableName}' not found` });
		}

		const scope = await getRequestScope(req);
		const requesterRole = String((req as any)?.user?.role || '').toLowerCase();

		if (tableName === 'todos') {
			const status = (req.query.status ?? req.query.status_filter) as string | undefined;
			const type = (req.query.type ?? req.query.todoType) as string | undefined;
			const priority = (req.query.priority ?? req.query.todoPriority) as string | undefined;
			const assignedToUserId = req.query.assignedToUserId ?? req.query.assigned_to_user_id;
			const linkedEntityType = (req.query.linkedEntityType ?? req.query.linked_entity_type) as string | undefined;
			const linkedEntityId = req.query.linkedEntityId ?? req.query.linked_entity_id;
			const dueBefore = req.query.dueBefore ?? req.query.due_before;
			const dueAfter = req.query.dueAfter ?? req.query.due_after;
			const tagId = req.query.tagId ?? req.query.tag_id;
			const q = (req.query.q ?? req.query.search) as string | undefined;

			const filters: any[] = [];
			filters.push(sql`customer_id = ${scope.customerId}`);
			filters.push(sql`deleted_at IS NULL`);
			if (Array.isArray(scope.homeIds) && scope.homeIds.length > 0) {
				const homesArray = sql.raw(
					`ARRAY[${scope.homeIds.map((n) => Number(n)).filter((n) => Number.isFinite(n)).join(',')}]`
				);
				filters.push(sql`home_id = ANY(${homesArray})`);
			}

			if (type && typeof type === 'string') {
				if (['todo', 'conversation'].includes(type)) {
					filters.push(sql`type = ${type}`);
				}
			}

			if (priority && typeof priority === 'string') {
				if (['low', 'high'].includes(priority)) {
					filters.push(sql`priority = ${priority}`);
				}
			}

			if (status && typeof status === 'string') {
				if (['todo', 'in_progress', 'complete'].includes(status)) {
					filters.push(sql`status = ${status}`);
				} else if (status === 'open') {
					// Back-compat alias: open means not complete
					filters.push(sql`status <> 'complete'::todo_status`);
				} else if (status === 'completed') {
					// Back-compat alias
					filters.push(sql`status = 'complete'::todo_status`);
				}
			}

			if (assignedToUserId !== undefined) {
				const parsed = Number(assignedToUserId);
				if (Number.isFinite(parsed)) {
					filters.push(sql`assigned_to_user_ids @> ARRAY[${Math.trunc(parsed)}]::int[]`);
				}
			}

			if (linkedEntityType && typeof linkedEntityType === 'string' && linkedEntityType.trim()) {
				filters.push(sql`linked_entity_type = ${linkedEntityType.trim()}`);
			}
			if (linkedEntityId !== undefined) {
				const parsed = Number(linkedEntityId);
				if (Number.isFinite(parsed)) {
					filters.push(sql`linked_entity_id = ${Math.trunc(parsed)}`);
				}
			}

			if (dueBefore) {
				filters.push(sql`due_at <= ${String(dueBefore)}`);
			}
			if (dueAfter) {
				filters.push(sql`due_at >= ${String(dueAfter)}`);
			}

			if (tagId !== undefined) {
				const parsed = Number(tagId);
				if (Number.isFinite(parsed)) {
					filters.push(sql`tags @> ARRAY[${Math.trunc(parsed)}]::int[]`);
				}
			}

			if (q && typeof q === 'string' && q.trim()) {
				const pattern = `%${q.trim()}%`;
				filters.push(sql`(title ILIKE ${pattern} OR body ILIKE ${pattern})`);
			}

			const whereClause = filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;

			const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
				return scopedDb.execute(sql`
					SELECT * FROM todos
					${whereClause}
					ORDER BY id DESC
					LIMIT ${sql.raw(String(ENV_DEFAULT_LIMIT))}
				`);
			});

			const transformed = transformRows(results.rows, tableName);
			return res.json({ table: tableName, data: transformed, count: transformed.length });
		}

		if (tableName === 'users') {
			const normalizedHomes = (scope.homeIds || [])
				.map((n) => Number(n))
				.filter((n) => Number.isFinite(n));
			const isAdmin = requesterRole === 'admin';
			if (!isAdmin && normalizedHomes.length === 0) {
				return res.json({ table: tableName, data: [], count: 0 });
			}

			const homesArray = !isAdmin
				? sql.raw(`ARRAY[${normalizedHomes.join(',')}]::int[]`)
				: null;

			const results = await withTenantScope(
				{ customerId: scope.customerId, homeIds: scope.homeIds },
				async (scopedDb) => {
					if (isAdmin) {
						return scopedDb.execute(sql`
							SELECT * FROM users
							WHERE customer_id = ${scope.customerId}
							ORDER BY id
							LIMIT ${sql.raw(String(ENV_DEFAULT_LIMIT))}
						`);
					}
					return scopedDb.execute(sql`
						SELECT u.*
						FROM users u
						WHERE u.customer_id = ${scope.customerId}
						  AND EXISTS (
							SELECT 1
							FROM user_home_access uha
							WHERE uha.user_id = u.id
							  AND uha.home_id = ANY(${homesArray!})
						  )
						ORDER BY u.id
						LIMIT ${sql.raw(String(ENV_DEFAULT_LIMIT))}
					`);
				}
			);

			const transformed = transformRows(results.rows, tableName);
			return res.json({ table: tableName, data: transformed, count: transformed.length });
		}

		// Build scoped WHERE clause (server-authoritative)
			const policy = await getTablePolicy(tableName);

			// Build WHERE clause with inline parameters
			let whereClause = sql``;
			const hasHomes = Array.isArray(scope.homeIds) && scope.homeIds.length > 0;
			if (policy.hasCustomerId && policy.hasHomeId && hasHomes) {
				const homesArray = sql.raw(`ARRAY[${scope.homeIds!.map((n) => Number(n)).filter((n) => Number.isFinite(n)).join(',')}]`);
				whereClause = sql`WHERE customer_id = ${scope.customerId} AND home_id = ANY(${homesArray})`;
			} else if (policy.hasCustomerId) {
				whereClause = sql`WHERE customer_id = ${scope.customerId}`;
			} else if (policy.hasHomeId && hasHomes) {
				const homesArray = sql.raw(`ARRAY[${scope.homeIds!.map((n) => Number(n)).filter((n) => Number.isFinite(n)).join(',')}]`);
				whereClause = sql`WHERE home_id = ANY(${homesArray})`;
			}

			// Execute within withTenantScope to make this RLS-ready:
			// - Sets app.customer_id and app.home_ids for the transaction
			// - If RLS is enabled, the DB will enforce the same filters
			const results = await withTenantScope({ customerId: scope.customerId, homeIds: scope.homeIds }, async (scopedDb) => {
				return scopedDb.execute(sql`
					SELECT * FROM ${sql.identifier(tableName)}
					${whereClause}
					LIMIT ${sql.raw(String(ENV_DEFAULT_LIMIT))}
				`);
			});

		// Transform field names from snake_case to camelCase using Drizzle schema mappings
		const transformedData = transformRows(results.rows, tableName);

		res.json({
			table: tableName,
			data: transformedData,
			count: transformedData.length,
		});
	} catch (error: any) {
		console.error(`❌ Error fetching table ${req.params.tableName}:`, error);
		const msg = (error?.message || '').toString();
		if (msg.toLowerCase().includes('unauthorized')) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		res.status(500).json({ error: "Internal server error" });
	}
});

export default router;

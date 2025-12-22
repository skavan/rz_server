/**
 * Raw Table API - Returns raw SQL data (snake_case)
 * No field transformation applied - returns data exactly as stored in database
 */
import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "@postgress/shared";
import { optionalAuth } from "../auth/index.js";
import { getRequestScope } from "../utils/scope.js";
import { getTablePolicy } from "../utils/policy-registry.js";
import { ENV_DEFAULT_LIMIT } from "./shared/validation.js";

const router = Router();

/**
 * GET /api/table-raw
 * Get list of available tables from the database (same as regular table endpoint)
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
 * Raw SQL Table API Endpoint
 * GET /api/table-raw/:tableName - Query any table using raw SQL without field transformation
 * Returns snake_case field names exactly as they appear in the database
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

		// First verify the table exists in the database
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


		// Build scoped WHERE clause (server-authoritative)
		const scope = await getRequestScope(req);
		const policy = await getTablePolicy(tableName);

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

		// Query the table data using raw SQL - NO field transformation
		const results = await db.execute(sql`
      SELECT * FROM ${sql.identifier(tableName)}
      ${whereClause}
      LIMIT ${sql.raw(String(ENV_DEFAULT_LIMIT))}
    `);

		// Return raw data with original snake_case field names
		res.json({
			table: tableName,
			data: results.rows,
			count: results.rows.length,
		});
	} catch (error: any) {
		console.error(`❌ Error fetching raw table ${req.params.tableName}:`, error);
		const msg = (error?.message || '').toString();
		if (msg.toLowerCase().includes('unauthorized')) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		res.status(500).json({ error: "Internal server error" });
	}
});

export default router;

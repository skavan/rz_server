/**
 * Dynamic DB Table API - Raw SQL table data endpoint
 * Renamed from /api/table to /api/dbTable for raw database access
 */
import { Router } from 'express';
import { pool } from '../db/index.js';
import { optionalAuth } from '../auth/index.js';

const router = Router();

/**
 * GET /api/dbTable
 * Get list of all table names
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const enforce = process.env.ENFORCE_AUTH === 'true' || process.env.NODE_ENV === 'production';
    if (enforce && !(req as any).user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    const result = await pool.query(query);
    
    res.json({
      count: result.rows.length,
      tables: result.rows.map(row => row.table_name)
    });

  } catch (error: any) {
    console.error('Tables list error:', error);
    res.status(500).json({ 
      error: 'Query failed',
      message: error.message || error.toString() || 'Unknown error'
    });
  }
});

/**
 * GET /api/dbTable/:tableName
 * Get all raw data from any table (snake_case SQL format)
 */
router.get('/:tableName', optionalAuth, async (req, res) => {
  try {
    const enforce = process.env.ENFORCE_AUTH === 'true' || process.env.NODE_ENV === 'production';
    if (enforce && !(req as any).user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { tableName } = req.params;
    
    // Simple query - just get all data from the table
    const query = `SELECT * FROM ${tableName} LIMIT 100`;
    const result = await pool.query(query);
    
    res.json({
      table: tableName,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error: any) {
    console.error(`Table ${req.params.tableName} error:`, error);
    res.status(500).json({ 
      error: 'Query failed',
      table: req.params.tableName,
      message: error.message || error.toString() || 'Unknown error'
    });
  }
});

export default router;

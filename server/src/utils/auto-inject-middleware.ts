/**
 * Middleware: Auto-inject scoping fields (customerId/homeId) into request body
 * 
 * Usage:
 *   router.post('/', authenticateToken, autoInjectMiddleware('products'), async (req, res) => {
 *     // req.body.homeId is now guaranteed to exist (auto-injected from scope)
 *   });
 */

import type { Request, Response, NextFunction } from 'express';
import { getRequestScope, canWrite } from './scope.js';
import { autoInjectScope, type TableName } from './auto-inject.js';

/**
 * Middleware factory: Auto-inject scoping fields for a specific table
 * 
 * @param tableName - The table name (determines which fields to inject)
 * @param options - Configuration options
 * 
 * @example
 * // For products (auto-inject homeId)
 * router.post('/', authenticateToken, autoInjectMiddleware('products'), async (req, res) => {
 *   // req.body.homeId automatically added if missing
 *   await db.insert(products).values(req.body);
 * });
 * 
 * @example
 * // For categories (auto-inject customerId)
 * router.post('/', authenticateToken, autoInjectMiddleware('categories'), async (req, res) => {
 *   // req.body.customerId automatically added
 *   await db.insert(categories).values(req.body);
 * });
 */
export function autoInjectMiddleware(
  tableName: TableName,
  options: {
    /** Skip auto-injection for these routes (useful for bulk operations) */
    skipForPaths?: string[];
    /** Require write access (non-viewer role) - defaults to false */
    requireWrite?: boolean;
    /** Custom error handler */
    onError?: (error: Error, req: Request, res: Response) => void;
  } = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip if path matches exclusion list
      if (options.skipForPaths?.some(path => req.path.includes(path))) {
        return next();
      }

      // Get authenticated scope
      const scope = await getRequestScope(req as any);

      // Check write access if required
      if (options.requireWrite && !canWrite(scope)) {
        return res.status(403).json({ error: 'Read-only access. Write operations not permitted.' });
      }

      // Auto-inject scoping fields into request body
      req.body = autoInjectScope(tableName, scope, req.body || {});

      // Attach scope to request for later use (optional)
      (req as any).scope = scope;

      next();
    } catch (error) {
      if (options.onError) {
        options.onError(error as Error, req, res);
      } else {
        // Default error handling
        const err = error as Error;
        if (err.message.includes('Unauthorized')) {
          return res.status(403).json({ error: err.message });
        }
        if (err.message.includes('required')) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

/**
 * Middleware: Auto-inject for multiple tables (useful for bulk operations)
 * 
 * @example
 * router.post('/bulk', authenticateToken, autoInjectBulkMiddleware('products'), async (req, res) => {
 *   // req.body.products[] - each item has homeId auto-injected
 *   await db.insert(products).values(req.body.products);
 * });
 */
export function autoInjectBulkMiddleware(
  tableName: TableName,
  options: {
    /** Property name containing the array of items (default: tableName) */
    arrayProperty?: string;
  } = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getRequestScope(req as any);
      const arrayProp = options.arrayProperty || tableName;
      
      if (Array.isArray(req.body[arrayProp])) {
        req.body[arrayProp] = req.body[arrayProp].map((item: any) =>
          autoInjectScope(tableName, scope, item)
        );
      }

      (req as any).scope = scope;
      next();
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Helper: Get scope from request (after middleware runs)
 * 
 * @example
 * router.post('/', authenticateToken, autoInjectMiddleware('products'), async (req, res) => {
 *   const scope = getScopeFromRequest(req);
 *   // Use scope.customerId, scope.homeIds
 * });
 */
export function getScopeFromRequest(req: Request) {
  return (req as any).scope;
}

/**
 * Middleware: Require write access for mutations (PUT/DELETE)
 * Resolves scope and checks homeAccessRole. Use after authenticateToken.
 * 
 * @example
 * router.put('/:id', authenticateToken, requireWriteMiddleware, async (req, res) => {...});
 */
export function requireWriteMiddleware(req: Request, res: Response, next: NextFunction) {
  (async () => {
    try {
      const scope = await getRequestScope(req as any);
      (req as any).scope = scope;
      if (!canWrite(scope)) {
        return res.status(403).json({ error: 'Read-only access. Write operations not permitted.' });
      }
      next();
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  })();
}

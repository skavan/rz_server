# How-To-Server.md: Multi-Tenant PostgreSQL API Server

A comprehensive guide for building a production-ready Express.js API server with PostgreSQL, Drizzle ORM, Row Level Security (RLS), Server-Sent Events (SSE), and real-time data triggers.

## 🏗️ Architecture Overview

This stack provides:
- **Multi-tenant data isolation** via PostgreSQL Row Level Security (RLS)
- **Real-time updates** via Server-Sent Events (SSE) + PostgreSQL LISTEN/NOTIFY
- **Type-safe database** with Drizzle ORM and shared schema package
- **Auto-scoping middleware** that handles tenant context automatically
- **Event-driven architecture** with data change broadcasts

### Core Technologies
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL with Row Level Security (RLS)
- **ORM**: Drizzle ORM with full type safety
- **Real-time**: Server-Sent Events (SSE) + PostgreSQL triggers
- **Security**: JWT authentication + RLS policies + dedicated app role

---

## 📦 Project Structure

```
your-server/
├── src/
│   ├── server.ts              # Main Express app
│   ├── auth/                  # JWT authentication
│   ├── db/                    # Database connection & scoping
│   ├── routes/                # API route handlers
│   ├── utils/                 # Core utilities
│   │   ├── scope.ts           # Request scope resolution
│   │   ├── auto-inject.ts     # Auto-inject tenant fields
│   │   ├── event-bus.ts       # SSE event broadcasting
│   │   └── policy-registry.ts # RLS policy management
│   └── realtime/              # Real-time infrastructure
├── scripts/
│   ├── rls/                   # RLS setup scripts
│   ├── realtime/              # Database trigger setup
│   └── drizzle/               # Database management
├── shared/                    # Shared schema package
│   ├── src/
│   │   ├── schema.ts          # Drizzle table definitions
│   │   └── zod.ts             # Validation schemas
│   └── dist/                  # Compiled shared package
└── docs/                      # Documentation
```

---

## 🚀 Getting Started

### 1. Project Setup

```bash
# Initialize project
npm init -y
npm install express cors helmet dotenv jsonwebtoken bcryptjs
npm install -D @types/node @types/express @types/cors @types/jsonwebtoken tsx typescript

# Database & ORM
npm install drizzle-orm drizzle-kit pg
npm install -D @types/pg

# Validation
npm install zod drizzle-zod

# Development
npm install tsx nodemon
```

### 2. TypeScript Configuration

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Environment Setup

Create `.env`:
```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/your_database

# Security
JWT_SECRET=your-super-secret-jwt-key-change-in-production
APP_DB_ROLE=app_role  # Dedicated role for RLS enforcement

# Server
PORT=5000
NODE_ENV=development
CLIENT_URLS=http://localhost:3000,http://localhost:3001

# Optional: Debug flags
FIELD_TRANSFORM_DEBUG=true
```

---

## 🗄️ Database Setup

### 1. Multi-Tenant Schema Design

Every table should follow the tenant pattern:

```typescript
// shared/src/schema.ts
import { pgTable, serial, integer, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

// Core tenant tables
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  // ... other fields
});

export const homes = pgTable('homes', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  // ... other fields
});

// Business tables - follow tenant patterns:
// - Customer-level: only customerId
// - Home-level: both customerId and homeId
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  // ... other fields
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  // ... other fields
});
```

### 2. Database Connection with Scoping

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../shared/src/schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

// Tenant-scoped database transactions
export async function withTenantScope<T>(
  scope: { customerId: number; homeIds: number[] },
  operation: (scopedDb: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Set tenant context for RLS policies
    await tx.execute(sql`SELECT set_config('app.customer_id', ${scope.customerId.toString()}, true)`);
    await tx.execute(sql`SELECT set_config('app.home_ids', ${scope.homeIds.join(',')}, true)`);
    
    // Switch to application role (enforces RLS)
    const appRole = process.env.APP_DB_ROLE;
    if (appRole) {
      await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(appRole)}`);
    }
    
    return await operation(tx);
  });
}
```

---

## 🔐 Row Level Security (RLS) Setup

### 1. Create Application Role

```sql
-- scripts/rls/setup-app-role.sql
-- Create dedicated application role (not a superuser)
CREATE ROLE app_role NOINHERIT;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;

-- Grant to your API database user
GRANT app_role TO your_api_user;
```

### 2. RLS Policy Template

```sql
-- Enable RLS on table
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Read Policy (SELECT)
CREATE POLICY tenant_read ON categories
  FOR SELECT TO PUBLIC
  USING (
    (current_setting('app.customer_id', true))::int = customer_id
  );

-- Write Policy (INSERT)
CREATE POLICY tenant_write ON categories
  FOR INSERT TO PUBLIC
  WITH CHECK (
    (current_setting('app.customer_id', true))::int = customer_id
  );

-- Update Policy (UPDATE)
CREATE POLICY tenant_update ON categories
  FOR UPDATE TO PUBLIC
  USING (
    (current_setting('app.customer_id', true))::int = customer_id
  )
  WITH CHECK (
    (current_setting('app.customer_id', true))::int = customer_id
  );

-- Delete Policy (DELETE)
CREATE POLICY tenant_delete ON categories
  FOR DELETE TO PUBLIC
  USING (
    (current_setting('app.customer_id', true))::int = customer_id
  );
```

### 3. Multi-Level Policies (Customer + Home)

For tables with both `customer_id` and `home_id`:

```sql
-- Read policy with home filtering
CREATE POLICY tenant_read ON products
  FOR SELECT TO PUBLIC
  USING (
    -- Must belong to customer's accessible homes
    home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
  );

-- Write policy with customer + home validation
CREATE POLICY tenant_write ON products
  FOR INSERT TO PUBLIC
  WITH CHECK (
    -- Validate customer owns the home
    EXISTS (
      SELECT 1 FROM homes 
      WHERE id = home_id 
        AND customer_id = (current_setting('app.customer_id', true))::int
    )
    AND home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
  );
```

---

## 🔄 Real-Time Updates System

### 1. Database Triggers for Change Notifications

```sql
-- scripts/realtime/sql/notify_data_change.sql
CREATE OR REPLACE FUNCTION notify_data_change()
RETURNS TRIGGER AS $$
DECLARE
  payload json;
BEGIN
  -- Build notification payload
  payload = json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'row_id', COALESCE(NEW.id, OLD.id),
    'customer_id', COALESCE(NEW.customer_id, OLD.customer_id),
    'home_id', COALESCE(NEW.home_id, OLD.home_id),
    'timestamp', extract(epoch from now())
  );
  
  -- Send notification
  PERFORM pg_notify('data_change', payload::text);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for each table
CREATE TRIGGER products_notify_change
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION notify_data_change();
```

### 2. Server-Side Event Bus

```typescript
// src/utils/event-bus.ts
import type { Response } from 'express';

export type RealtimeEvent = {
  event: string;
  data: any;
  meta?: { 
    timestamp?: number;
    audience?: { customerId?: number; homeIds?: number[] };
  };
};

class EventBus {
  private subscribers: Set<{
    res: Response;
    scope: { customerId?: number; homeIds?: number[] };
  }> = new Set();

  subscribe(res: Response, scope: { customerId?: number; homeIds?: number[] }) {
    const subscriber = { res, scope };
    this.subscribers.add(subscriber);
    
    return () => this.subscribers.delete(subscriber);
  }

  broadcast(event: RealtimeEvent) {
    const line = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    
    for (const sub of this.subscribers) {
      // Enforce tenant scoping
      const audience = event.meta?.audience;
      if (audience && sub.scope) {
        if (audience.customerId && audience.customerId !== sub.scope.customerId) {
          continue;
        }
        // Check home access if specified
        if (audience.homeIds?.length) {
          const hasAccess = audience.homeIds.some(h => 
            sub.scope.homeIds?.includes(h)
          );
          if (!hasAccess) continue;
        }
      }
      
      try {
        sub.res.write(line);
      } catch {
        // Remove broken connections
        this.subscribers.delete(sub);
      }
    }
  }
}

export const eventBus = new EventBus();
```

### 3. PostgreSQL Listener

```typescript
// src/realtime/pg-listener.ts
import { Client } from 'pg';
import { eventBus } from '../utils/event-bus.js';

export async function startPgListener() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  await client.query('LISTEN data_change');
  
  client.on('notification', (msg) => {
    if (msg.channel === 'data_change' && msg.payload) {
      try {
        const payload = JSON.parse(msg.payload);
        
        eventBus.broadcast({
          event: `data_change:${payload.table}`,
          data: {
            operation: payload.operation,
            resourceId: payload.row_id,
            table: payload.table
          },
          meta: {
            timestamp: payload.timestamp * 1000,
            audience: {
              customerId: payload.customer_id,
              homeIds: payload.home_id ? [payload.home_id] : undefined
            }
          }
        });
      } catch (error) {
        console.error('Failed to process notification:', error);
      }
    }
  });
}
```

---

## 🎯 Auto-Scoping Middleware

### 1. Scope Resolution

```typescript
// src/utils/scope.ts
export async function getRequestScope(req: Request): Promise<{
  customerId: number;
  homeIds: number[];
}> {
  // Get user from JWT
  const authUser = (req as any).user;
  
  if (authUser?.id) {
    // Fetch user's customer and home access from database
    const userRes = await db.execute(
      sql`SELECT customer_id FROM users WHERE id = ${authUser.id}`
    );
    
    const homesRes = await db.execute(
      sql`SELECT home_id FROM user_home_access WHERE user_id = ${authUser.id}`
    );
    
    const customerId = userRes.rows[0]?.customer_id;
    const homeIds = homesRes.rows.map(r => r.home_id);
    
    if (!customerId) {
      throw new Error('Unauthorized: no customer association');
    }
    
    return { customerId, homeIds };
  }
  
  // Development fallback (remove in production)
  if (process.env.NODE_ENV !== 'production') {
    return { customerId: 1, homeIds: [1] };
  }
  
  throw new Error('Unauthorized');
}
```

### 2. Auto-Inject Middleware

```typescript
// src/utils/auto-inject-middleware.ts
export function autoInjectMiddleware(tableName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getRequestScope(req);
      
      // Auto-inject tenant fields based on table schema
      if (tableName === 'categories' || tableName === 'brands') {
        // Customer-level tables
        if (!req.body.customerId) {
          req.body.customerId = scope.customerId;
        }
      } else if (tableName === 'products' || tableName === 'locations') {
        // Home-level tables
        if (!req.body.homeId) {
          req.body.homeId = scope.homeIds[0]; // Default to first accessible home
        }
      }
      
      // Attach scope for later use
      (req as any).scope = scope;
      
      next();
    } catch (error) {
      res.status(403).json({ error: (error as Error).message });
    }
  };
}
```

---

## 🛣️ API Route Patterns

### 1. Basic CRUD with Scoping

```typescript
// src/routes/products.ts
import { Router } from 'express';
import { db, withTenantScope } from '../db/index.js';
import { products, eq } from '../../shared/src/schema.js';
import { autoInjectMiddleware, getScopeFromRequest } from '../utils/auto-inject-middleware.js';
import { eventBus } from '../utils/event-bus.js';

const router = Router();

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    
    const results = await withTenantScope(scope, async (scopedDb) => {
      return scopedDb
        .select()
        .from(products)
        .orderBy(products.name);
    });
    
    res.json({ data: results });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products
router.post('/', autoInjectMiddleware('products'), async (req, res) => {
  try {
    const scope = getScopeFromRequest(req);
    
    const [created] = await withTenantScope(scope, async (scopedDb) => {
      return scopedDb
        .insert(products)
        .values(req.body)
        .returning();
    });
    
    // Broadcast real-time update
    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'create', resourceId: created.id, data: created },
      meta: { 
        audience: { 
          customerId: scope.customerId,
          homeIds: [created.homeId] 
        }
      }
    });
    
    res.status(201).json({ data: created });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const { id } = req.params;
    
    const [updated] = await withTenantScope(scope, async (scopedDb) => {
      return scopedDb
        .update(products)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(products.id, Number(id)))
        .returning();
    });
    
    if (!updated) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    eventBus.broadcast({
      event: 'data_change:products',
      data: { type: 'update', resourceId: updated.id, data: updated },
      meta: { audience: { customerId: scope.customerId, homeIds: [updated.homeId] } }
    });
    
    res.json({ data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### 2. Server-Sent Events Endpoint

```typescript
// src/routes/events.ts
router.get('/stream', authenticateToken, async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Subscribe to event bus
    const unsubscribe = eventBus.subscribe(res, scope);
    
    // Send initial connection confirmation
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', scope })}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
      unsubscribe();
      console.log('SSE client disconnected');
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

---

## 🔒 Authentication Setup

### 1. JWT Middleware

```typescript
// src/auth/index.ts
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET!, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    (req as any).user = user;
    next();
  });
}

// Optional: Less strict for development
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    return authenticateToken(req, res, next);
  }
  
  // Dev mode: allow requests without auth
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    return authenticateToken(req, res, next);
  }
  
  next();
}
```

---

## 🌐 Main Server Setup

```typescript
// src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authenticateToken } from './auth/index.js';

// Import routes
import productsRoutes from './routes/products.js';
import eventsRoutes from './routes/events.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URLS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes
app.use('/api/products', authenticateToken, productsRoutes);
app.use('/api/events', eventsRoutes);

async function startServer() {
  try {
    // Initialize database triggers
    const { ensureDataChangeTriggers } = await import('./realtime/setup-triggers.js');
    await ensureDataChangeTriggers();
    
    // Start PostgreSQL listener
    const { startPgListener } = await import('./realtime/pg-listener.js');
    await startPgListener();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
```

---

## 🔧 Deployment & Scripts

### 1. Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/drizzle/apply-migrations.ts",
    "rls:setup": "tsx scripts/rls/setup-app-role.ts",
    "rls:apply": "tsx scripts/rls/apply-rls.ts",
    "rls:check": "tsx scripts/rls/check-rls.ts"
  }
}
```

### 2. Production Considerations

#### Security Checklist:
- [ ] Use dedicated database user (not superuser)
- [ ] Enable RLS on all tables
- [ ] Rotate JWT secrets regularly
- [ ] Use HTTPS in production
- [ ] Set strong database passwords
- [ ] Limit database connection pool size
- [ ] Enable database audit logging

#### Performance Optimizations:
- [ ] Add database indexes for tenant filtering
- [ ] Use connection pooling
- [ ] Implement rate limiting
- [ ] Add request caching where appropriate
- [ ] Monitor query performance
- [ ] Set up database read replicas if needed

#### Monitoring Setup:
- [ ] Add health check endpoints
- [ ] Monitor SSE connection counts
- [ ] Track database query performance
- [ ] Log authentication failures
- [ ] Monitor tenant data isolation

---

## 🧪 Testing RLS Policies

```sql
-- Test tenant isolation
BEGIN;
  -- Set tenant context
  SELECT set_config('app.customer_id', '1', true);
  SELECT set_config('app.home_ids', '1,2', true);
  SET LOCAL ROLE app_role;
  
  -- This should only return data for customer 1, homes 1,2
  SELECT * FROM products;
  
  -- Test with different context
  SELECT set_config('app.customer_id', '2', true);
  SELECT set_config('app.home_ids', '3', true);
  
  -- Should return different data set
  SELECT * FROM products;
ROLLBACK;
```

---

## 📚 Additional Resources

### Useful Tools:
- **Drizzle Studio**: Visual database explorer
- **pgAdmin**: PostgreSQL administration
- **Postman**: API testing
- **SSE clients**: Browser dev tools or curl

### Further Reading:
- [PostgreSQL Row Level Security Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---

## 🎯 Quick Start Checklist

1. [ ] **Project Setup**: Install dependencies and configure TypeScript
2. [ ] **Database**: Create PostgreSQL database and connection
3. [ ] **Schema**: Define Drizzle tables with tenant fields
4. [ ] **RLS**: Set up application role and security policies  
5. [ ] **Auth**: Implement JWT authentication middleware
6. [ ] **Scoping**: Add auto-inject middleware for tenant context
7. [ ] **Routes**: Create CRUD endpoints with proper scoping
8. [ ] **Real-time**: Set up database triggers and SSE streaming
9. [ ] **Testing**: Verify tenant isolation and real-time updates
10. [ ] **Deploy**: Configure production security and monitoring

This architecture provides a solid foundation for building scalable, secure, multi-tenant applications with real-time capabilities.
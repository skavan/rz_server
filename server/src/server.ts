/**
 * Server V2 - Clean Express + Drizzle + PostgreSQL
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import locationsRoutes from './routes/locations.js';
import tableRoutes from './routes/table.js';
import drizzleTableRoutes from './routes/drizzle-table.js';
import tableRawRoutes from './routes/table-raw.js';
import eventsRoutes from './routes/events.js';

// Load environment variables
dotenv.config();
// Default to enforcing auth unless explicitly disabled
if (process.env.ENFORCE_AUTH === undefined) {
  process.env.ENFORCE_AUTH = 'true';
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const raw = process.env.CLIENT_URL || process.env.CLIENT_URLS;
    const defaults = ['http://localhost:3000', 'http://localhost:3001'];
    const allowed = raw ? raw.split(',').map(s => s.trim()) : defaults;
    if (!origin) return callback(null, true); // non-browser or same-origin
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    database: 'connected'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/table', drizzleTableRoutes);     // New Drizzle-shaped endpoints
app.use('/api/table-raw', tableRawRoutes);     // Raw SQL endpoints (no field transformation)
app.use('/api/dbTable', tableRoutes);          // Raw SQL endpoints
app.use('/api/events', eventsRoutes);          // SSE events

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Server V2',
    version: '2.0.0',
    description: 'Clean PostgreSQL + Drizzle + Express server',
    endpoints: [
      'GET /health',
      'GET /',
      'POST /api/auth/login',
  'POST /api/auth/refresh',
      'POST /api/auth/register',
      'GET /api/products',
      'GET /api/products/:id',
      'POST /api/products',
      'PUT /api/products/:id',
      'DELETE /api/products/:id',
      'GET /api/table/categories',
      'GET /api/table/locations',
      'GET /api/table/inventory_items',
      'GET /api/table/*',
      'GET /api/dbTable',
      'GET /api/dbTable/:tableName'
    ]
  });
});

// Error handling middleware
app.use((error: any, req: any, res: any, next: any) => {
  console.error('API Error:', error.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl
  });
});

async function startServer() {
  try {
    // Test database connection on startup
    const { db, pool } = await import('./db/index.js');
    console.log('✅ Database connection verified');
    try {
      const info = await pool.query("SELECT current_database() as db, inet_server_addr() as host, inet_server_port() as port");
      const row: any = info.rows?.[0] || {};
      console.log(`🗄️  Connected DB: ${row.db} @ ${row.host}:${row.port}`);
    } catch (e) {
      console.warn('⚠️  Failed to fetch DB info for logging');
    }

    // Eagerly initialize policy registry (derives customer_id/home_id presence per table)
    try {
      const { initPolicyRegistry } = await import('./utils/policy-registry.js');
      await initPolicyRegistry();
      console.log('✅ Policy registry initialized from information_schema');
    } catch (e: any) {
      console.warn('⚠️ Policy registry init failed; will lazy-init on first use:', e?.message || e);
    }

    // Ensure DB triggers and start PG LISTEN/NOTIFY listener
    try {
      const { ensureDataChangeTriggers } = await import('./realtime/setup-triggers.js');
      await ensureDataChangeTriggers();
      const { startPgListener } = await import('./realtime/pg-listener.js');
      await startPgListener();
      console.log('🔔 Realtime changefeed active (LISTEN data_change)');
    } catch (e: any) {
      console.warn('⚠️ Realtime setup failed; SSE will only receive route-emitted events:', e?.message || e);
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server V2 running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`📦 Products API: http://localhost:${PORT}/api/products`);
  console.log(`🌐 CORS enabled for: ${(process.env.CLIENT_URL || process.env.CLIENT_URLS || 'http://localhost:3000,http://localhost:3001')}`);
    });

  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer().catch(console.error);

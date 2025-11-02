/**
 * Server V2 - Clean Express + Drizzle + PostgreSQL
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import skusRoutes from './routes/skus.js';
import inventoryItemsRoutes from './routes/inventory-items.js';
import locationsRoutes from './routes/locations.js';
import categoriesRoutes from './routes/categories.js';
import brandsRoutes from './routes/brands.js';
import vendorsRoutes from './routes/vendors.js';
import homesRoutes from './routes/homes.js';
import tagsRoutes from './routes/tags.js';
import reservationsRoutes from './routes/reservations.js';
import reservationsV1Routes from './routes/reservations-v1.js';
import tableRoutes from './routes/table.js';
import drizzleTableRoutes from './routes/drizzle-table.js';
import tableRawRoutes from './routes/table-raw.js';
import eventsRoutes from './routes/events.js';
import crmRoutes from './routes/crm/index.js';
import crmContactsRoutes from './routes/crm/contacts.js';
import crmLeadSourcesRoutes from './routes/crm/lead-sources.js';
import bookingRoutes from './routes/booking/index.js';
import bookingReservationsRoutes from './routes/booking/reservations.js';
import bookingFinancialsRoutes from './routes/booking/financials.js';
import bookingNotesRoutes from './routes/booking/notes.js';
import financeRoutes from './routes/finance/index.js';
import financeCommissionsRoutes from './routes/finance/commissions.js';
import mediaRoutes from './routes/media.js';

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
app.use('/api/skus', skusRoutes);
app.use('/api/inventory-items', inventoryItemsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/homes', homesRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/reservations-v1', reservationsV1Routes);
app.use('/api/crm', crmRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/crm-contacts', crmContactsRoutes);
app.use('/api/crm-lead-sources', crmLeadSourcesRoutes);
app.use('/api/booking-reservations', bookingReservationsRoutes);
app.use('/api/booking-financials', bookingFinancialsRoutes);
app.use('/api/booking-notes', bookingNotesRoutes);
app.use('/api/finance-commissions', financeCommissionsRoutes);
app.use('/api/table', drizzleTableRoutes);     // New Drizzle-shaped endpoints
app.use('/api/table-raw', tableRawRoutes);     // Raw SQL endpoints (no field transformation)
app.use('/api/dbTable', tableRoutes);          // Raw SQL endpoints
app.use('/api/events', eventsRoutes);          // SSE events
app.use('/api/media', mediaRoutes);            // Media upload/management

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
      'POST /api/products/composite',
      'PUT /api/products/:id',
      'PUT /api/products/:id/composite',
      'DELETE /api/products/:id',
      'GET /api/skus',
      'GET /api/skus/:id',
      'POST /api/skus',
      'POST /api/skus/composite',
      'PUT /api/skus/:id',
      'PUT /api/skus/:id/composite',
      'DELETE /api/skus/:id',
      'GET /api/inventory-items',
      'GET /api/inventory-items/:id',
      'POST /api/inventory-items',
      'PUT /api/inventory-items/:id',
      'DELETE /api/inventory-items/:id',
      'PATCH /api/inventory-items/:id/adjust-quantity',
      'GET /api/categories',
      'GET /api/brands',
      'GET /api/vendors',
      'GET /api/locations',
      'GET /api/homes',
      'GET /api/tags',
  'GET /api/reservations',
  'GET /api/reservations/:id',
  'POST /api/reservations',
  'PUT /api/reservations/:id',
  'DELETE /api/reservations/:id',
  'GET /api/reservations-v1',
  'GET /api/reservations-v1/:id',
  'GET /api/reservations-v1/property/:propertyId',
  'GET /api/reservations-v1/status/:status',
  'POST /api/reservations-v1',
  'PUT /api/reservations-v1/:id',
  'DELETE /api/reservations-v1/:id',
  'GET /api/crm/contacts',
  'POST /api/crm/contacts',
  'PUT /api/crm/contacts/:id',
  'DELETE /api/crm/contacts/:id',
  'GET /api/crm-contacts',
  'POST /api/crm-contacts',
  'PUT /api/crm-contacts/:id',
  'DELETE /api/crm-contacts/:id',
  'GET /api/crm/lead-sources',
  'POST /api/crm/lead-sources',
  'PUT /api/crm/lead-sources/:id',
  'DELETE /api/crm/lead-sources/:id',
  'GET /api/crm-lead-sources',
  'POST /api/crm-lead-sources',
  'PUT /api/crm-lead-sources/:id',
  'DELETE /api/crm-lead-sources/:id',
  'GET /api/booking/reservations',
  'GET /api/booking/financials',
  'GET /api/booking/notes',
  'POST /api/booking/reservations',
  'POST /api/booking/financials',
  'POST /api/booking/notes',
  'PUT /api/booking/reservations/:id',
  'PUT /api/booking/financials/:id',
  'PUT /api/booking/notes/:id',
  'DELETE /api/booking/reservations/:id',
  'DELETE /api/booking/financials/:id',
  'DELETE /api/booking/notes/:id',
  'GET /api/booking-reservations',
  'GET /api/booking-financials',
  'GET /api/booking-notes',
  'POST /api/booking-reservations',
  'POST /api/booking-financials',
  'POST /api/booking-notes',
  'PUT /api/booking-reservations/:id',
  'PUT /api/booking-financials/:id',
  'PUT /api/booking-notes/:id',
  'DELETE /api/booking-reservations/:id',
  'DELETE /api/booking-financials/:id',
  'DELETE /api/booking-notes/:id',
  'GET /api/finance/commissions',
  'POST /api/finance/commissions',
  'PUT /api/finance/commissions/:id',
  'DELETE /api/finance/commissions/:id',
  'GET /api/finance-commissions',
  'POST /api/finance-commissions',
  'PUT /api/finance-commissions/:id',
  'DELETE /api/finance-commissions/:id',
  'GET /api/table/*',
      'GET /api/table-raw/*',
      'GET /api/dbTable/:tableName',
      'GET /api/events (SSE)'
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

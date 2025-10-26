# RZ Server

A PostgreSQL-backed Express server with Drizzle ORM, real-time updates via Server-Sent Events, and JWT authentication.

## Features

- **RESTful API**: Express-based REST API with automatic table endpoints
- **Database**: PostgreSQL with Drizzle ORM for type-safe queries
- **Real-time**: Server-Sent Events (SSE) with PostgreSQL LISTEN/NOTIFY
- **Authentication**: JWT-based auth with bcrypt password hashing
- **Authorization**: User-home access control via `user_home_access` table
- **Schema Management**: Drizzle Kit for migrations and schema introspection
- **TypeScript**: Full type safety with shared schema package

## Architecture

### Server (`/server`)
Express server with authentication, real-time updates, and dynamic table routing.

**Key Components:**
- **Routes** (`src/routes/`): API endpoints for auth, tables, and real-time events
- **Database** (`src/db/`): Drizzle connection and query helpers
- **Auth** (`src/auth/`): JWT generation/verification and password hashing
- **Realtime** (`src/realtime/`): PostgreSQL pub/sub for live updates
- **Utils** (`src/utils/`): Field transformers, policy registry, event bus

### Shared Schema (`/drizzle/shared`)
Database schema definitions and validation shared between server and clients.

**Exports:**
- **Schema** (`src/schema.ts`): Drizzle table definitions
- **Validation** (`src/zod.ts`): Zod schemas for runtime validation
- **Client Utils** (`src/client.ts`): Client-side validators and helpers
- **Types** (`src/types/`): TypeScript types for data structures

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install shared schema dependencies
cd ../drizzle/shared
npm install
npm run build
cd ../..
```

### 2. Database Setup

```bash
# Create database
createdb rental_inventory

# Or use custom connection string
export DATABASE_URL="postgresql://user:pass@localhost:5432/your_db"
```

### 3. Environment Configuration

Create `server/.env`:
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rental_inventory

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=86400  # 24 hours in seconds

# Server
PORT=5000
NODE_ENV=development

# Token Refresh
REFRESH_GRACE_SECONDS=43200  # 12 hours grace period for token refresh
```

### 4. Initialize Database

```bash
cd server

# Build the schema migrations
npm run db:push

# Seed initial data (optional)
npm run seed

# Setup realtime triggers
npm run realtime:setup
```

### 5. Start Development Server

```bash
cd server
npm run dev
```

Server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login (returns JWT token)
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh JWT token

### Resource Endpoints
**Products**:
- `GET /api/products` - List products with filtering
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product
- `POST /api/products/composite` - Create product with components (BOM)
- `PUT /api/products/:id` - Update product
- `PUT /api/products/:id/composite` - Update product and replace components
- `DELETE /api/products/:id` - Delete product (guards against usage)

**SKUs**:
- `GET /api/skus` - List SKUs with filtering
- `GET /api/skus/:id` - Get single SKU
- `POST /api/skus` - Create SKU
- `POST /api/skus/composite` - Create SKU with components (BOM)
- `PUT /api/skus/:id` - Update SKU
- `PUT /api/skus/:id/composite` - Update SKU and replace components
- `DELETE /api/skus/:id` - Delete SKU (guards against usage)

**Other Resources**:
- Inventory Items, Locations, Categories, Brands, Vendors, Homes, Tags
- All follow standard CRUD patterns

### Component (BOM) Support
Products and SKUs support Bill of Materials relationships:
- **`/composite` endpoints**: Create/update items with their component relationships
- **Delete guards**: Prevent deletion if item is used as a component elsewhere
- **Cascade deletes**: When parent deleted, component relationships auto-removed
- See `server/docs/components-api.md` for full documentation

### Dynamic Table Endpoints
Generic table access for all tables:
- `GET /api/table/:tableName` - List records (camelCase response)
- `GET /api/table-raw/:tableName` - List records (snake_case response)

### Real-time Events
- `GET /api/events` - Server-Sent Events stream for real-time updates

## Database Schema

### Core Tables
- `users` - User accounts with authentication
- `customers` - Top-level customer organizations
- `user_home_access` - User-to-home permissions mapping
- `homes` - Properties/locations managed by customers
- `locations` - Hierarchical location tree within homes
- `categories` - Hierarchical product categories
- `brands` - Product brands
- `vendors` - Product vendors
- `products` - Product definitions
- `product_components` - Bill of Materials for products
- `skus` - Stock keeping units (customer-scoped catalog items)
- `sku_components` - Bill of Materials for SKUs
- `inventory_items` - Individual inventory items
- `tags` - Tagging system for products/items

See `drizzle/shared/src/schema.ts` for complete schema.

## Development

### Project Structure
```
rz_server/
├── server/                    # Express server
│   ├── src/
│   │   ├── routes/           # API endpoints
│   │   ├── db/               # Database connection
│   │   ├── auth/             # Authentication logic
│   │   ├── realtime/         # SSE and PostgreSQL pub/sub
│   │   └── utils/            # Utilities
│   ├── scripts/              # Database and utility scripts
│   │   ├── auth/            # User management scripts
│   │   ├── db/              # Database utilities
│   │   ├── drizzle/         # Schema management
│   │   ├── realtime/        # Realtime setup
│   │   └── rls/             # Row-level security (optional)
│   └── package.json
├── drizzle/                   # Database schema
│   └── shared/               # Shared schema package
│       ├── src/
│       │   ├── schema.ts    # Drizzle table definitions
│       │   ├── zod.ts       # Validation schemas
│       │   └── client.ts    # Client utilities
│       └── package.json
└── full-schema.sql           # Complete SQL schema export
```

### Useful Scripts

**Server:**
```bash
cd server

# Development
npm run dev              # Start with hot reload
npm run build            # Compile TypeScript
npm start                # Run compiled code

# Database
npm run seed             # Seed with test data
npm run realtime:setup   # Setup realtime triggers
npm run db:push          # Push schema changes
npm run db:studio        # Open Drizzle Studio

# Utilities
npm run check:db         # Verify database connection
```

**Shared Schema:**
```bash
cd drizzle/shared

# Build
npm run build            # Compile TypeScript
npm run dev              # Watch mode

# Testing
npm test                 # Run validation tests
```

## Authentication Flow

1. **Login**: `POST /api/auth/login` with email/password
2. **Server**:
   - Verifies credentials
   - Queries `user_home_access` for allowed homes
   - Returns JWT token + user data (including `allowedHomeIds`)
3. **Client**: Includes JWT in `Authorization: Bearer <token>` header
4. **Server**: Validates JWT on protected routes
5. **Refresh**: `POST /api/auth/refresh` to get new token before expiry

## Real-time Updates

The server uses PostgreSQL LISTEN/NOTIFY for real-time updates:

1. Database triggers notify on INSERT/UPDATE/DELETE
2. Server listens to PostgreSQL notifications
3. Server broadcasts to connected SSE clients
4. Clients receive instant updates

**Example client connection:**
```javascript
const eventSource = new EventSource('http://localhost:5000/api/events/stream', {
  headers: { 'Authorization': 'Bearer <token>' }
});

eventSource.addEventListener('data-change', (event) => {
  const { table, operation, data } = JSON.parse(event.data);
  console.log(`${table} ${operation}:`, data);
});
```

## Security

- ✅ JWT authentication with configurable expiration
- ✅ Password hashing with bcrypt
- ✅ User-home access control
- ✅ Token refresh with grace period
- ✅ CORS configuration
- ⚠️ Row-level security policies (optional, see `/server/scripts/rls/`)

## Deployment

### Environment Variables
```bash
DATABASE_URL=postgresql://...
JWT_SECRET=strong-random-secret
JWT_EXPIRES_IN=86400
PORT=5000
NODE_ENV=production
REFRESH_GRACE_SECONDS=43200
```

### Production Checklist
- [ ] Change JWT_SECRET to strong random value
- [ ] Use connection pooling for DATABASE_URL
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for production domains
- [ ] Set up database backups
- [ ] Monitor real-time connections
- [ ] Consider row-level security policies

## Troubleshooting

### Database Connection Issues
```bash
# Test connection
cd server
npm run check:db

# Verify DATABASE_URL
echo $DATABASE_URL
```

### Missing Home Access
```bash
# Check user's home access
cd server
node scripts/check-user-homes.js
```

### Schema Sync Issues
```bash
# Rebuild schema
cd drizzle/shared
npm run build

# Push to database
cd ../../server
npm run db:push
```

## Contributing

1. Follow existing code patterns
2. Use TypeScript strict types
3. Update schema in `drizzle/shared/src/schema.ts`
4. Run `npm run build` in shared package after schema changes
5. Test authentication and realtime features

## License

[Your License Here]

## Related Repositories

- **declarative-client**: Next.js client with form/view engines (separate repo)
hope its working!
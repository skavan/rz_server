# 🏗️ ARCHITECTURE OVERVIEW

## System Design

```
┌──────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                        │
│                  (with RLS & Triggers)                        │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│  SERVER (Express API)   │       │  CLIENT (React)         │
│  ├─ Drizzle ORM        │       │  ├─ React Hook Form     │
│  ├─ JWT Auth           │       │  ├─ Zod Validation      │
│  ├─ Auto-inject        │       │  └─ Tanstack Query      │
│  │  middleware         │       │                         │
│  └─ RLS-aware queries  │       │                         │
└─────────────────────────┘       └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
              ┌──────────────────────────────┐
              │   @skavan/rentalzen-drizzle          │
              │   ├─ schema.ts (Drizzle)    │
              │   ├─ zod.ts (Validation)    │
              │   └─ types/ (TypeScript)    │
              └──────────────────────────────┘
```

---

## Core Concepts

### 1. Single Source of Truth

**`drizzle/shared/src/schema.ts`** defines everything:
- Database schema (Drizzle)
- TypeScript types (auto-generated)
- Zod validation schemas (auto-generated, then extended with defaults)

**Why?** Prevents drift between server and client.

---

### 2. Auto-Injection Middleware

Server automatically injects `customerId` and `homeId` from JWT token:

```typescript
// Server route
router.post('/', authenticateToken, autoInjectMiddleware('products'), async (req, res) => {
  // req.body.customerId and req.body.homeId already injected!
});
```

**Why?** Client doesn't need to pass these fields - simplifies API, prevents security issues.

**Applied to:** products, categories, brands, vendors, tags, locations, inventory-items

---

### 3. Validation with Defaults

Zod schemas have sensible defaults built-in:

```typescript
// Client form data (minimal)
const formData = { name: 'Laptop', slug: 'laptop' };

// Validation adds defaults
const validated = productsValidationSchema.parse(formData);
// Result: { name: 'Laptop', slug: 'laptop', isVisible: true, isActive: true, ... }
```

**Why?** Forms don't need hidden fields for defaults - cleaner UI, less code.

---

### 4. Row-Level Security (RLS)

PostgreSQL policies enforce data isolation:
- Users see only their customer's data
- Homes enforce access control
- Server-side role (`app_role`) has full access

**Why?** Security enforced at database level, not just application level.

---

## Key Features

### Field Harmonization

**`kind` field** replaces old naming variations:
- Values: `'simple'` | `'bom'`
- Used in: `products`, `skus`
- Default: `'simple'`

### Special Field Validators

Custom Zod transformers for common patterns:
```typescript
// Date strings → Date objects
dateFieldValidator: z.string().transform(str => new Date(str))

// String IDs → Number IDs
parentIdValidator: z.string().transform(str => parseInt(str, 10))

// String arrays → Number arrays
tagIdsValidator: z.array(z.string()).transform(arr => arr.map(Number))

// JSON cadence fields
cadenceJsonFieldValidator: z.object({ targetDays, maxDays })
```

---

## Data Flow

### Creating a Product (End-to-End)

```typescript
// 1. CLIENT: User fills form
const formData = {
  name: 'MacBook Pro',
  slug: 'macbook-pro',
  categoryId: 5
  // Note: No customerId, homeId, or boolean defaults needed!
};

// 2. CLIENT: Validate with Zod
const validated = productsValidationSchema.parse(formData);
// Adds defaults: { ..., isVisible: true, isActive: true, hasMediaAssets: false, kind: 'simple' }

// 3. CLIENT: POST to API
await fetch('/api/products', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify(validated)
});

// 4. SERVER: Middleware injects fields
// authenticateToken → extracts userId from JWT
// autoInjectMiddleware → adds customerId, homeId from user's session
// req.body now has: { name, slug, categoryId, isVisible, isActive, hasMediaAssets, kind, customerId, homeId }

// 5. SERVER: Insert to database
const result = await db.insert(products).values(req.body).returning();

// 6. DATABASE: RLS policies verify user has access to this customerId/homeId
// If policy fails, query returns 0 rows (security!)

// 7. SERVER: Return result to client
res.json(result);
```

---

## Package Structure

```
drizzle/shared/
├── src/
│   ├── schema.ts           # Drizzle schema (SOURCE OF TRUTH)
│   ├── zod.ts              # Zod schemas with defaults
│   ├── client.ts           # Client-safe exports (no DB connection)
│   ├── server-only.ts      # Server-only exports (DB connection)
│   ├── index.ts            # Main exports
│   └── types/
│       ├── index.ts        # Type exports
│       ├── data.ts         # Data type helpers
│       └── json-fields.ts  # JSON field types
├── dist/                   # Compiled output (git-ignored)
├── package.json
├── tsconfig.json
└── [Documentation]
```

---

## Security Model

### Authentication
- JWT tokens issued on login
- Token contains: `userId`, `email`, `customerId`, `homeId`
- Middleware (`authenticateToken`) verifies token on every request

### Authorization (RLS)
- Database enforces policies per table
- Policies check: `auth.customer_id()` and `auth.home_id()`
- Server uses `app_role` to bypass RLS for admin operations

### Auto-Injection
- Prevents client from spoofing `customerId` or `homeId`
- Server extracts from verified JWT token
- Middleware injects into request body automatically

---

## Design Decisions

### Why Drizzle ORM?
- Type-safe queries
- Schema-first design
- Simple migrations
- No magic, just SQL

### Why Zod?
- Runtime validation
- Type inference
- Composable schemas
- Works with React Hook Form

### Why RLS?
- Security at database level
- Multi-tenant isolation
- Works even if app has bugs
- Enforced for all connections

### Why Auto-Injection?
- Simplifies client code
- Prevents security mistakes
- DRY principle
- Consistent behavior across all routes

---

## Best Practices

1. **Schema changes:** Always edit `drizzle/shared/src/schema.ts` first
2. **Migrations:** Generate migrations for production, push for dev
3. **Testing:** Use `test-schemas.js` to verify validation works
4. **RLS:** Always test with regular user, not admin
5. **Defaults:** Let Zod handle defaults, not hidden form fields

---

## Common Patterns

### Adding a New Table

```typescript
// 1. Define schema
export const myTable = pgTable('my_table', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  homeId: integer('home_id').notNull().references(() => homes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

// 2. Create Zod schema
export const myTableValidationSchema = createValidationSchema(myTable).extend({
  isActive: z.boolean().default(true),
});

// 3. Build and migrate
// npm run build → npx drizzle-kit generate → npm run migrate

// 4. Add route with auto-inject
router.post('/', authenticateToken, autoInjectMiddleware('myTable'), async (req, res) => {
  const result = await db.insert(myTable).values(req.body).returning();
  res.json(result);
});

// 5. Add RLS policy (optional but recommended)
```

---

## Troubleshooting

### Schema changes not appearing
→ Did you run `npm run build` in `drizzle/shared`?

### Client validation fails
→ Did you sync package? (`npm install` in client)

### Database out of sync
→ Run `npx drizzle-kit check` to see status

### RLS blocking queries
→ Check if `app_role` is set correctly
→ Verify policies with `tsx scripts/rls/check-rls.ts`

### Auto-inject not working
→ Verify route has `autoInjectMiddleware('tableName')`
→ Check JWT token has `customerId` and `homeId`

---

## Further Reading

- `SYNC_WORKFLOW.md` - How to sync changes
- `AVAILABLE_SCRIPTS.md` - All available commands
- `server/docs/AUTO_INJECT_IMPLEMENTATION.md` - Auto-inject details
- `server/docs/rls-setup-cheatsheet.md` - RLS setup guide

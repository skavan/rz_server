# 🛠️ AVAILABLE SCRIPTS

## Build & Development

### `npm run build`
**Location:** `drizzle/shared/`  
**Purpose:** Compile TypeScript to JavaScript  
**Output:** `dist/` folder  
**When to use:** After any schema or Zod changes

```powershell
cd drizzle/shared
npm run build
```

---

## Database Management

### Generate Migration
**Command:** `npx drizzle-kit generate`  
**Location:** `server/`  
**Purpose:** Create SQL migration from schema changes  
**Output:** Migration file in `server/drizzle/`

```powershell
cd server
npx drizzle-kit generate
```

### Apply Migrations
**Command:** `npm run migrate`  
**Location:** `server/`  
**Purpose:** Run pending migrations against database  
**Script:** `server/scripts/drizzle/apply-migrations.ts`

```powershell
cd server
npm run migrate
```

### Push Schema (Dev Only)
**Command:** `npx drizzle-kit push`  
**Location:** `server/`  
**Purpose:** Push schema changes directly to DB (no migration file)  
**Use case:** Rapid prototyping

```powershell
cd server
npx drizzle-kit push
```

### Check Schema Status
**Command:** `npx drizzle-kit check`  
**Location:** `server/`  
**Purpose:** Verify database schema matches Drizzle schema

```powershell
cd server
npx drizzle-kit check
```

---

## Database Utilities (server/scripts/)

### Create Database
**Script:** `scripts/drizzle/create-db.ts`  
**Purpose:** Create fresh database with schema

```powershell
cd server
tsx scripts/drizzle/create-db.ts
```

### Rebuild Database
**Script:** `scripts/drizzle/drizzle-rebuild.ts`  
**Purpose:** Drop all tables and rebuild from scratch  
**⚠️ Destructive!**

```powershell
cd server
tsx scripts/drizzle/drizzle-rebuild.ts
```

### Seed Data
**Script:** `scripts/seed-data.ts`  
**Purpose:** Load seed data from JSON files

```powershell
cd server
tsx scripts/seed-data.ts
```

### Fix Sequences
**Script:** `scripts/db/fix-all-sequences.ts`  
**Purpose:** Reset auto-increment sequences after manual data import

```powershell
cd server
tsx scripts/db/fix-all-sequences.ts
```

---

## RLS (Row Level Security)

### Apply RLS Policies
**Script:** `scripts/rls/apply-rls-v2.ts`  
**Purpose:** Apply row-level security policies

```powershell
cd server
tsx scripts/rls/apply-rls-v2.ts
```

### Check RLS Status
**Script:** `scripts/rls/check-rls.ts`  
**Purpose:** Verify which tables have RLS enabled

```powershell
cd server
tsx scripts/rls/check-rls.ts
```

---

## Authentication Helpers

### Set Dev Password
**Script:** `scripts/auth/set-dev-password.ts`  
**Purpose:** Set a known password for testing

```powershell
cd server
tsx scripts/auth/set-dev-password.ts <email> <password>
```

### Print User Info
**Script:** `scripts/auth/print-user.ts`  
**Purpose:** Show user details for debugging

```powershell
cd server
tsx scripts/auth/print-user.ts <email>
```

### Grant Dev Memberships
**Script:** `scripts/auth/grant-dev-memberships.ts`  
**Purpose:** Add user to homes for testing

```powershell
cd server
tsx scripts/auth/grant-dev-memberships.ts
```

---

## Testing & Validation

### Test Schemas
**Script:** `test-schemas.js`  
**Location:** `drizzle/shared/`  
**Purpose:** Verify Zod schemas work with defaults

```powershell
cd drizzle/shared
node test-schemas.js
```

### Validation Demo
**Script:** `src/validation-demo.ts`  
**Location:** `drizzle/shared/`  
**Purpose:** Test field validators (dates, IDs, etc.)

```powershell
cd drizzle/shared
tsx src/validation-demo.ts
```

---

## Quick Reference

| Task | Command | Location |
|------|---------|----------|
| Build shared package | `npm run build` | `drizzle/shared/` |
| Generate migration | `npx drizzle-kit generate` | `server/` |
| Apply migrations | `npm run migrate` | `server/` |
| Seed database | `tsx scripts/seed-data.ts` | `server/` |
| Fix sequences | `tsx scripts/db/fix-all-sequences.ts` | `server/` |
| Test schemas | `node test-schemas.js` | `drizzle/shared/` |

---

## Common Workflows

### Fresh Start (Rebuild Everything)
```powershell
cd server
tsx scripts/drizzle/drizzle-rebuild.ts  # Drop & recreate
tsx scripts/seed-data.ts                # Load data
tsx scripts/db/fix-all-sequences.ts     # Fix auto-increment
tsx scripts/rls/apply-rls-v2.ts         # Apply RLS
```

### Schema Change Workflow
```powershell
# 1. Edit drizzle/shared/src/schema.ts
cd drizzle/shared
npm run build

# 2. Generate & apply migration
cd ../../server
npx drizzle-kit generate
npm run migrate

# 3. Sync to client
cd ../client
npm install
```

### Fix Broken Auth
```powershell
cd server
tsx scripts/auth/set-dev-password.ts admin@test.com Password123!
tsx scripts/auth/grant-dev-memberships.ts
```

---

## Script Locations

```
server/scripts/
├── auth/
│   ├── grant-dev-memberships.ts
│   ├── print-user.ts
│   └── set-dev-password.ts
├── db/
│   ├── fix-all-sequences.ts
│   └── fix-sequences.ts
├── drizzle/
│   ├── apply-migrations.ts
│   ├── create-db.ts
│   ├── drizzle-rebuild.ts
│   └── simple-rebuild.ts
├── rls/
│   ├── apply-rls-v2.ts
│   ├── apply-rls.ts
│   └── check-rls.ts
└── seed-data.ts

drizzle/shared/
├── test-schemas.js
└── src/validation-demo.ts
```

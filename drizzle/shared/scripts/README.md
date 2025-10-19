# Schema Development Scripts

These scripts automate the workflow for managing Drizzle schemas and Zod validation during development.

## Quick Reference

```bash
# After changing schema.ts or zod.ts
npm run rebuild-schemas

# Sync changes to client (dev mode)
npm run sync-schemas

# Check that defaults are working
npm run check-defaults
```

## Scripts Overview

### 1. `rebuild-schemas`

**Purpose**: Rebuild the shared package after schema changes

**When to use**:
- After modifying `schema.ts`
- After adding/changing Zod refinements in `zod.ts`
- Before committing schema changes

**What it does**:
1. ✅ Compiles TypeScript (`tsc`)
2. ✅ Validates that dist files exist
3. ✅ Shows next steps

**Usage**:
```bash
npm run rebuild-schemas
```

### 2. `sync-schemas`

**Purpose**: Push schema changes to client during development

**When to use**:
- During active development with client app
- After running `rebuild-schemas`
- When client needs latest validation schemas

**What it does**:
1. ✅ Rebuilds shared package
2. ✅ Locates client directory
3. ✅ Runs `pnpm install --force` in client
4. ✅ Client gets latest schemas immediately

**Usage**:
```bash
# Standard (rebuilds + syncs)
npm run sync-schemas

# Skip rebuild (if you just built)
npm run sync-schemas -- --skip-build

# Custom client path
npm run sync-schemas -- --client-path=/path/to/client
```

**Default client path**: `../../../client` (relative to shared package)

### 3. `check-defaults`

**Purpose**: Verify that Zod defaults are working correctly

**When to use**:
- After adding new default refinements
- Debugging form initialization issues
- Validating schema sync

**What it does**:
1. ✅ Loads compiled schemas from dist/
2. ✅ Parses empty objects to trigger defaults
3. ✅ Displays all default values

**Usage**:
```bash
npm run check-defaults
```

**Example output**:
```
📋 Product Schema Defaults:
  ✅ isVisible: true
  ✅ isActive: true
  ✅ hasMediaAssets: false
  ✅ kind: simple
```

## Development Workflow

### Standard Workflow

1. **Edit schema** in `src/schema.ts`:
   ```typescript
   export const products = pgTable('products', {
     isFeatured: boolean('is_featured').default(false),
   });
   ```

2. **Add Zod refinement** in `src/zod.ts`:
   ```typescript
   export const productValidationSchema = createValidationSchema(products, {
     isFeatured: z.boolean().default(false),
   });
   ```

3. **Rebuild**:
   ```bash
   npm run rebuild-schemas
   ```

4. **Sync to client** (if needed):
   ```bash
   npm run sync-schemas
   ```

5. **Verify defaults** (optional):
   ```bash
   npm run check-defaults
   ```

### Quick Sync During Development

If you're actively developing and want fast client updates:

```bash
# Terminal 1: Watch mode for instant rebuilds
npm run dev

# Terminal 2: When ready to test in client
npm run sync-schemas -- --skip-build
```

## Troubleshooting

### "Client directory not found"

```bash
# Specify custom path
npm run sync-schemas -- --client-path=../my-client-app
```

### "schema.js not found in dist/"

```bash
# Make sure to build first
npm run build
npm run check-defaults
```

### "pnpm install failed"

- Make sure client uses `pnpm` (not `npm` or `yarn`)
- Or modify `sync-to-client.ts` to use your package manager

### Defaults not appearing in forms

1. Check that default exists in `schema.ts`:
   ```typescript
   isActive: boolean('is_active').default(true)
   ```

2. Check that refinement exists in `zod.ts`:
   ```typescript
   export const productValidationSchema = createValidationSchema(products, {
     isActive: z.boolean().default(true),
   });
   ```

3. Rebuild and sync:
   ```bash
   npm run rebuild-schemas
   npm run sync-schemas
   ```

4. Verify defaults are working:
   ```bash
   npm run check-defaults
   ```

## Advanced Usage

### Custom Client Path (Permanent)

Edit `scripts/sync-to-client.ts`:

```typescript
const defaultClientPath = join(rootDir, '..', 'my-custom-client');
```

### Skip Validation

Edit `scripts/rebuild-schemas.ts` to remove Step 2 if validation slows you down.

### Add Pre-commit Hook

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run rebuild-schemas && npm run check-defaults"
    }
  }
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build shared schemas
  run: |
    cd drizzle/shared
    npm run rebuild-schemas
```

### Pre-deployment Check

```bash
npm run rebuild-schemas && npm run check-defaults
```

## File Structure

```
drizzle/shared/
├── src/
│   ├── schema.ts          # Drizzle table definitions
│   └── zod.ts             # Zod validation schemas with refinements
├── scripts/
│   ├── rebuild-schemas.ts # Build + validate
│   ├── sync-to-client.ts  # Push to client
│   └── check-defaults.ts  # Verify defaults
└── package.json           # Script definitions
```

## Best Practices

✅ **DO**:
- Run `rebuild-schemas` before committing
- Use `sync-schemas` during active dev
- Run `check-defaults` after adding new defaults
- Keep defaults in sync between schema.ts and zod.ts

❌ **DON'T**:
- Forget to rebuild after schema changes
- Manually run `tsc && cd ../../../client && pnpm install --force`
- Add defaults only in zod.ts (also add to schema.ts)

## See Also

- [DEFAULTS_GUIDE.md](./DEFAULTS_GUIDE.md) - Complete guide to managing defaults
- [README.md](./README.md) - Package overview

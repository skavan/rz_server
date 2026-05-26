# Drizzle Shared Client Migration Instructions

This document is for the **client repository** migration.

Goal:

- Move client from local file dependency + old scope:
  - `@postgress/shared`
  - `"file:../rz_server/drizzle/shared"`
- To published package:
  - `@skavan/rentalzen-drizzle`

## Prerequisites

1. Shared package is published (example target: `@skavan/rentalzen-drizzle@1.0.1`).
2. You have GitHub Packages read access token.
3. Client repo uses npm/pnpm/yarn with lockfile.

## Step 1: Configure client registry auth

In the **client repo root**, create or update `.npmrc`:

```ini
@skavan:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Set token in your shell before install (PowerShell):

```powershell
$env:GITHUB_PACKAGES_TOKEN="<your_token_here>"
```

## Step 2: Update dependency in client package.json

In client `package.json` dependencies, replace:

```json
"@postgress/shared": "file:../rz_server/drizzle/shared"
```

with:

```json
"@skavan/rentalzen-drizzle": "1.0.1"
```

If old dependency exists in multiple sections (`dependencies`, `devDependencies`, `peerDependencies`), update all occurrences.

## Step 3: Replace imports across codebase

Replace import source strings:

- From `@postgress/shared`
- To `@skavan/rentalzen-drizzle`

### PowerShell bulk replace (run in client repo root)

```powershell
$files = Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs,*.json
foreach ($f in $files) {
  $content = Get-Content -LiteralPath $f.FullName -Raw
  $new = $content.Replace("@postgress/shared", "@skavan/rentalzen-drizzle")
  if ($new -ne $content) {
    Set-Content -LiteralPath $f.FullName -Value $new -NoNewline
  }
}
```

## Step 4: Verify no old references remain

```powershell
rg "@postgress/shared|file:\.\./rz_server/drizzle/shared"
```

Expected:

- No matches.

Confirm new references exist:

```powershell
rg "@skavan/rentalzen-drizzle"
```

Expected:

- Matches in imports and package manifests.

## Step 5: Reinstall dependencies

Use your package manager from client repo root.

### pnpm

```powershell
pnpm install
```

### npm

```powershell
npm install
```

### yarn

```powershell
yarn install
```

## Step 6: Build and run client validation

Run these in the client repo:

1. Typecheck/build
2. Start dev server
3. Validate key screens/flows that rely on shared schemas/types/defaults

Minimum checks:

1. Forms that use Zod schemas from shared
2. Data mapping for server payloads
3. Any client-side defaults derived from shared

## Step 7: CI pipeline updates (client repo)

In client CI (GitHub Actions):

1. Add secret `GITHUB_PACKAGES_TOKEN`.
2. Ensure `.npmrc` auth setup is available during install step.
3. Re-run install + build job.

## Common issues and fixes

### 1) 401/403 when installing package

Cause:

- Missing/invalid token or missing package read permission.

Fix:

1. Verify token is set in environment.
2. Verify `.npmrc` at client root contains `@skavan` registry mapping.
3. Verify token has read access to GitHub Packages.

### 2) Module not found for old package

Cause:

- Old import string still in source.

Fix:

1. Re-run replace pass.
2. Re-run `rg` checks.

### 3) Lockfile still pins old file dependency

Fix:

1. Remove lockfile + reinstall (only if standard reinstall did not update entries).
2. Commit updated lockfile.

## Suggested migration commit message

```text
chore(client): migrate shared dependency to @skavan/rentalzen-drizzle
```

## Definition of done

Migration is complete when all are true:

1. No `@postgress/shared` references in client repo.
2. No local file dependency to `../rz_server/drizzle/shared`.
3. Client installs package from GitHub Packages successfully.
4. Client build/typecheck passes.
5. Critical flows validate with no schema/type regressions.

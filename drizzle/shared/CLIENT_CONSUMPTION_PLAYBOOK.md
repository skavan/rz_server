# Shared Drizzle Playbook (Plain English)

## Why this document exists

You said you want one simple way of working where:

- This repo remains the source of truth for database schema, types, and Zod defaults.
- A client in a separate repo can consume those changes easily.
- The workflow works on both Windows and Linux.
- The process is clear before we make any implementation changes.

This document is that plan.

---

## What is the source of truth

Only one place defines the data model:

- Drizzle schema definitions
- Shared types generated from schema
- Zod schemas and defaults generated from schema and shared validation layer

All downstream consumers (server and external client) should receive those artifacts from the shared package.

---

## What we are solving

Today, cross-repo local dependencies can work, but they are fragile when:

- Folder paths differ across machines
- Teams use different OS and shell habits
- Caches hide stale package content
- CI and local machines behave differently

Goal: one repeatable flow with low confusion.

---

## Recommended model (human version)

Treat shared as a product with versions.

That means:

1. Change schema and defaults in shared.
2. Build shared artifacts.
3. Publish a new package version.
4. Server and client move to that version.

Result:

- Works the same on Windows and Linux.
- No machine-specific path dependency required.
- Easier rollback and debugging.

---

## Workflow we will use (server first, client second)

### Step 1: Change shared definitions

Do the schema or validation/default updates in shared.

### Step 2: Build shared package

Build so generated outputs are fresh and valid.

Command:

```bash
cd drizzle/shared
npm run build
```

### Step 3: Validate on server

Update server to the new shared output/version first.

Check:

- Migrations are correct
- Server compiles
- API behavior still works

### Step 4: Validate on client

Update client to the same shared output/version second.

Check:

- Client compiles
- Forms and payloads match updated types/defaults
- End-to-end flows still work

### Step 5: Merge with release notes

Every shared change should include a short note:

- What changed in schema
- What changed in defaults/validation
- Whether client UI updates are required

Release automation command:

```bash
cd drizzle/shared
npm run release:shared -- patch -- --note "Describe release" --publish --push
```

See full details in `PUBLISH_WORKFLOW.md`.

---

## What this means for Windows and Linux

Good news:

- If we use a versioned package distribution model, OS differences mostly disappear.
- Everyone installs the same package version, regardless of machine path.

Important:

- Local path dependency remains useful for temporary development, but should not be the primary team workflow.
- CI should use the same install model as developers to avoid surprises.

---

## Migration and types policy

For each schema change:

1. Create migration from shared schema change.
2. Apply migration on server environments.
3. Release matching shared package version.
4. Update client to that exact version.

This keeps database shape, server behavior, and client types in sync.

---

## Versioning policy (simple)

- Patch: fixes that do not change API/data shape expectations.
- Minor: additive schema fields/defaults that are backward-compatible.
- Major: breaking field or behavior changes.

This allows predictable upgrades for downstream clients.

---

## Definition of done for shared changes

A shared change is complete only when all are true:

- Shared builds successfully.
- Server compiles and migration is applied/validated.
- Client compiles against same shared version.
- One real user flow works end-to-end.
- Release note is written in plain English.

---

## Tooling status

Release scaffolding is now available in this repo:

1. `scripts/release-shared.mjs`
2. `npm run release:shared`
3. `docs/releases/` template folder
4. `PUBLISH_WORKFLOW.md` runbook
5. `.github/workflows/publish-shared-package.yml` (no-local-OTP publish path)

---

## Quick summary

You keep one source of truth in shared.

We move to a versioned distribution workflow so server and client both consume shared safely on Windows and Linux.

Server is always validated first, client second.

That is the simplest model that scales without path/symlink headaches.

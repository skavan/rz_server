# Major Change Rollout - 2026-05-25

## Executive Summary

This rollout consolidates three critical tracks into one coordinated update:

1. Cross-platform path hardening (Windows + Ubuntu compatibility)
2. Shared package rename from `@postgress/shared` to `@skavan/rentalzen-drizzle`
3. Release workflow and downstream client consumption standardization

This was intentionally broad because partial rollout would leave the system in a mixed state.

## Scope and Blast Radius

- Total touched files in current working tree: 81
- Areas affected:
  - `server/src` runtime imports and utilities
  - `server/scripts` operational and seed scripts
  - `drizzle/shared` package identity, docs, examples, and generators
  - Shared release tooling and release note pipeline
  - Server and shared TypeScript config

## Why This Change Was Required

### 1. Ubuntu Deployment Risk

Windows-specific path assumptions caused deployment risk when cloning on Ubuntu.

### 2. Split-Brain Package Identity

Server and docs were using old package name while new naming decision had already been made.

### 3. Client Distribution Gap

External client repos need a stable versioned package flow rather than ad-hoc local path linking.

## What Was Changed

## A. Package Identity Standardized

- Canonical package name is now `@skavan/rentalzen-drizzle`
- Old references to `@postgress/shared` were replaced across non-generated files in:
  - `drizzle/shared/**`
  - `server/src/**`
  - `server/scripts/**`
  - server and shared package manifests

## B. Build + TypeScript Stabilization

- Shared build validated
- Server build validated
- TypeScript deprecation handling updated to use a TS5-compatible setting:
  - `"ignoreDeprecations": "5.0"`

## C. Publish Workflow Executed

Release workflow executed from `drizzle/shared`:

- Version bumped: `1.0.0` -> `1.0.1`
- Release commit created: `release(shared): v1.0.1`
- Tag created: `shared-v1.0.1`
- Release note file generated: `drizzle/shared/docs/releases/shared-v1.0.1.md`

Publish attempt reached npm registry but failed due missing auth on this machine (`ENEEDAUTH`).

## D. Immediate Distribution Fallback Created

- Built package tarball generated successfully:
  - `drizzle/shared/skavan-rentalzen-drizzle-1.0.1.tgz`

This enables immediate client testing even before registry auth is configured.

## Runtime Validation Results

### Successful

- Shared package compile: pass
- Server compile: pass
- Dev boot sequence reaches DB + realtime + PDF init successfully

### Remaining Non-Code Issue

- Dev startup still reports port conflict on `5000` (`EADDRINUSE`) if another process is already bound.
- This is operational/environmental, not a package rename regression.

## Client Migration Contract

For external client repositories:

1. Replace dependency key with `@skavan/rentalzen-drizzle`
2. Prefer registry version install once auth/registry is configured
3. Use tarball install as temporary bridge if registry publish is blocked
4. Re-run client build + key form/validation flows

## Recommended Cutover Checklist

1. Confirm npm auth in publishing environment (`npm whoami`)
2. Publish `@skavan/rentalzen-drizzle@1.0.1`
3. Update client dependency to `@skavan/rentalzen-drizzle@1.0.1`
4. Run client install/build/test pass
5. Announce old package name deprecation (`@postgress/shared`)
6. Keep this change grouped in release communications as a single major migration event

## Rollback Strategy

If an emergency rollback is needed:

1. Revert dependency references to old package name in server/client
2. Re-pin client to last known good package
3. Revert shared package rename commit set
4. Re-run build and smoke checks

Note: rollback is not recommended unless hard blocker is discovered, because mixed-name state is operationally confusing.

## Ownership and Next Action

- Engineering next action: authenticate npm on publish machine and run publish for `1.0.1`
- Integration next action: upgrade external client to `@skavan/rentalzen-drizzle@1.0.1`
- Ops next action: ensure single process binds `PORT=5000` in dev environments

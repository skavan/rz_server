# Shared Release v1.0.1

Date: 2026-05-25T22:49:32.527Z

## Summary
- Major rename to @skavan/rentalzen-drizzle and cross-platform hardening
- Standardized package identity across server runtime imports, scripts, docs, and shared examples
- Added release workflow assets for versioned client consumption

## Schema Changes
- No schema structure changes in this release.
- Migration files were not added/removed as part of v1.0.1.

## Defaults / Validation Changes
- No functional default/validation contract changes were introduced in v1.0.1.
- Documentation and import path examples were updated to the new package scope.

## Client Impact
- Dependency key must be changed from `@postgress/shared` to `@skavan/rentalzen-drizzle`.
- Import paths must use the new package scope:
	- `@skavan/rentalzen-drizzle`
	- `@skavan/rentalzen-drizzle/schema`
	- `@skavan/rentalzen-drizzle/zod`
- This is a naming migration release. Client teams should plan this as a coordinated update.

## Server Actions
- Migration required: no
- Required actions:
	- Ensure server dependency points to `@skavan/rentalzen-drizzle`
	- Reinstall dependencies
	- Run build validation (`npm run build`)

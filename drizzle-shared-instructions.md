# Drizzle Shared Instructions

This file is the current source of truth for publishing and consuming the shared package.

## Current package

- Package name: @skavan/rentalzen-drizzle
- Source lives in: drizzle/shared
- Publish target: GitHub Packages

## One-time setup per machine (no PAT rotation workflow)

Run once from repo root:

Windows PowerShell:

- npm run setup:gh-packages-auth

macOS/Linux:

- npm run setup:gh-packages-auth:sh

Open a fresh shell, then verify token is loaded:

- npm run gh-packages-token:length

Expected: non-zero number.

## Day-to-day publish commands (repo root)

Dry run:

- npm run publish:shared:dry

Real publish:

- npm run publish:shared

Check status:

- npm run publish:shared:status

One-command wrappers (release + push + publish + status):

- npm run publish_updated_drizzle_patch
- npm run publish_updated_drizzle_minor

Wrapper scripts use --skip-clean-check for convenience.

Pass note inline:

- npm run publish_updated_drizzle_patch -- --Note "Include bump-test doc update"
- npm run publish_updated_drizzle_minor -- --Note "Add optional vendor metadata fields"

Positional note also works:

- npm run publish_updated_drizzle_patch -- "Include bump-test doc update"

## How to bump version of drizzle/shared

Version bumps are done by the shared release script in drizzle/shared.

From repo root:

1. cd drizzle/shared
2. npm run release:shared -- patch -- --note "Describe the change"

Change patch to minor/major/prerelease as needed.

Optional detail mode (default is off):

- npm run release:shared -- patch -- --note "Describe the change" --detail

Note: wrapper scripts do not pass --detail by default. Use direct release:shared command when you want staged-file output.

What this does:

1. Builds shared package
2. Bumps version in package.json and package-lock.json
3. Creates release note file in drizzle/shared/docs/releases
4. Stages all changes under drizzle/shared for the release commit
5. Validates staged files are only under drizzle/shared (safety guard)
6. Creates commit + git tag

When --detail is passed, it also prints the staged shared file list before commit.

Then publish via workflow one-liner from repo root:

- npm run publish:shared

## How to choose patch vs minor vs major

Use semantic versioning rules:

- patch: fix only, no API change, no breaking behavior
- minor: new backward-compatible fields/types/helpers
- major: breaking change that requires client updates

Real fake examples from starting version 1.0.1:

1. Patch example (1.0.1 -> 1.0.2)
- npm run release:shared -- patch -- --note "Fix timezone parsing in purchase order date schemas"

2. Minor example (1.0.1 -> 1.1.0)
- npm run release:shared -- minor -- --note "Add optional vendor metadata fields and zod validators"

3. Major example (1.0.1 -> 2.0.0)
- npm run release:shared -- major -- --note "Rename status enum values; clients must update imports and mappings"

4. Prerelease example (for testing before stable)
- npm run release:shared -- prerelease -- --note "RC build for new media asset relation schema"

## Client repo auth and install

In the client repo root, add .npmrc:

@skavan:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}

Client install:

- pnpm add @skavan/rentalzen-drizzle@<new_version>

## Client migration from old local/shared dependency

Replace dependency key:

- From: @postgress/shared (file:../rz_server/drizzle/shared)
- To: @skavan/rentalzen-drizzle (versioned)

Replace imports in client code:

- From: @postgress/shared
- To: @skavan/rentalzen-drizzle

Reinstall and verify.

## Fresh clone checklist

For a new machine:

1. gh auth login (once)
2. Clone repo
3. Run setup:gh-packages-auth once
4. Open fresh terminal
5. Use publish one-liners

## Related docs

- drizzle-shared-client-migration-instructions.md
- drizzle/shared/PUBLISH_WORKFLOW.md
- drizzle/shared/PRECOMMIT_PUBLISH_CHECKLIST.md

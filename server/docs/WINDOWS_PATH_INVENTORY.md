# Windows Path Inventory

This file tracks explicit Windows-style path references still present in the repository after Linux hardening.

## Runtime / environment references

- server/.env:35
  - Comment example: `G:\OneDrive\Jamaica\Jamaica\Media`
- server/.env local:14
  - `UPLOAD_DIR=G:\OneDrive\Jamaica\Jamaica\Media`
- server/.env nike:13
  - `UPLOAD_DIR=G:\OneDrive\Jamaica\Jamaica\Media`
- server/.env.example:13
  - Comment example: `G:\OneDrive\Jamaica\Jamaica\Media`

## Server docs references

- server/docs/media-files-guide.md:5
  - Cross-platform example includes Windows path.

## Recently normalized

The following docs/scripts were converted to OS-neutral relative or placeholder paths:

- DOCUMENTATION.md
- drizzle/README.md
- drizzle/shared/QUICK_START.md
- drizzle/shared/DISTRIBUTION_GUIDE.md
- drizzle/shared/scripts/update-drizzle-shared.ts
- server/docs/rls-sql-cheatsheet-RC1.md
- server/docs/rls-setup-cheatsheet-RC1.md

## Suggested cleanup priority

1. High: active env files used by deployment
   - Replace machine-specific values before deploy.
2. Medium: setup docs users copy/paste from frequently
   - Replace with relative paths or `${PWD}` examples.
3. Low: historical/internal docs and helper scripts
   - Keep or modernize as needed.

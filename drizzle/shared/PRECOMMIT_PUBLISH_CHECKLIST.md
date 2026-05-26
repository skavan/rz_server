# Shared Publish Pre-Commit Checklist

Use this checklist before pushing and publishing `@skavan/rentalzen-drizzle`.

## Code and Build

- [ ] Shared package builds: `npm run build` (from `drizzle/shared`)
- [ ] Server builds against latest shared package: `npm run build` (from `server`)
- [ ] No accidental edits in generated output you do not intend to commit

## Package Hygiene

- [ ] `npm pack --dry-run` does not include `.env` files
- [ ] `npm pack --dry-run` does not include previous `.tgz` artifacts
- [ ] Package name/version is correct in `drizzle/shared/package.json`

## Release Metadata

- [ ] Release note exists in `drizzle/shared/docs/releases/` for the target version
- [ ] Release note includes summary, client impact, and server actions
- [ ] `PUBLISH_WORKFLOW.md` reflects current registry strategy

## Git State

- [ ] Working tree reviewed with `git status --short`
- [ ] Only intended files are staged
- [ ] Commit message clearly describes release/migration impact

## Registry/Publish

### If using GitHub Actions (recommended)

- [ ] `NPM_TOKEN` secret exists if publishing to npmjs
- [ ] Run workflow `Publish Shared Package` with `dry_run=true` first
- [ ] Run workflow again with `dry_run=false` after dry run passes

### If publishing locally (fallback)

- [ ] `npm whoami` succeeds
- [ ] Scope registry is correct: `npm config get @skavan:registry`
- [ ] Publish command succeeds: `npm publish --access restricted`

## Post-Publish

- [ ] Tag/release reference recorded
- [ ] Client repo dependency bump planned/applied
- [ ] Team notified of the new package version and migration notes

# Shared Package Publish Workflow

This is the practical workflow for publishing `@skavan/rentalzen-drizzle` so external clients can install by version on both Windows and Linux.

## Goal

- Keep fast local server development in this repo.
- Publish shared package versions at checkpoints.
- Let external client update by version (not local file path).

## Recommended default (no local OTP pain)

Use GitHub Actions to publish instead of local machine publish.

Benefits:

1. No interactive OTP prompts on developer machines.
2. Centralized token management in repo secrets.
3. Repeatable publish from one workflow.

Workflow file:

- `.github/workflows/publish-shared-package.yml`

Trigger:

1. Open Actions in GitHub.
2. Run workflow `Publish Shared Package`.
3. Choose registry (`npmjs` or `github`).
4. Set `dry_run=true` first, then run real publish.

## Where the package lives

Choose one npm-compatible registry:

1. GitHub Packages
2. Azure Artifacts
3. npm private org
4. Verdaccio (self-hosted)

The package is installed by version from that registry.

## One-time setup

1. Pick registry URL.
2. Authenticate from your machine (`npm login` or token in `.npmrc`).
3. Ensure registry can accept scoped package `@skavan/rentalzen-drizzle`.

Repository secrets required for CI publish:

1. `NPM_TOKEN` for npmjs publish (granular token with publish + 2FA bypass for automation).
2. `GITHUB_TOKEN` is provided automatically for GitHub Packages.

Auth check before publish:

```bash
npm whoami
```

If you receive `ENEEDAUTH`, configure auth first (see `.npmrc.example` guidance) and retry publish.

If you receive `E403` mentioning 2FA bypass, your account is authenticated but publish is blocked by npm 2FA policy.

Use one of these options:

1. Interactive/account publish with OTP:

```bash
npm publish --access restricted --otp=123456
```

2. CI/automation publish with a granular npm token that has publish permission and 2FA bypass enabled for automation.

That is the preferred path for this repo.

If you receive `E404 Not Found` on publish for `@skavan/rentalzen-drizzle`, it usually means one of these:

1. The publishing account/token is not authorized for the `@skavan` scope.
2. The `@skavan` npm org/scope is not set up for your account.
3. Auth is invalid and npm is masking permission details.

Quick checks:

```bash
npm whoami
npm config get registry
npm config get @skavan:registry
```

If unresolved, either grant proper scope access in npm org settings or temporarily publish under a scope your account owns.

## Release command (scripted)

From `drizzle/shared`:

```bash
npm run release:shared -- patch -- --note "Add reservation status defaults"
```

What it does:

1. Builds shared package
2. Bumps version in `package.json` and `package-lock.json`
3. Creates release note file in `docs/releases/`
4. Creates commit and git tag

Important:

- This local script is for release preparation.
- Prefer CI workflow for the final publish step.

Optional flags:

```bash
npm run release:shared -- patch -- --note "..." --publish
npm run release:shared -- minor -- --note "..." --publish --push
npm run release:shared -- prerelease -- --note "..." --dry-run --skip-clean-check
```

For 2FA-protected npm accounts, publish from this script will also require OTP/token policy satisfaction.
If needed, run release without `--publish`, then execute publish manually with OTP.

## If registry publish is blocked (quick fallback)

Generate a tarball for immediate downstream testing:

```bash
npm pack
```

Client can install the tarball directly:

```bash
pnpm add ../rz_server/drizzle/shared/rentalzen-drizzle-X.Y.Z.tgz
```

This is a temporary bridge. Move to versioned registry install as soon as auth is available.

## GitHub Packages caveat (important)

GitHub Packages npm registry expects scope alignment with repository owner/org.

Current package name:

- `@skavan/rentalzen-drizzle`

If repository owner differs from `rentalzen`, GitHub Packages publish may fail until scope/owner alignment is resolved.

For this repository (`skavan/rz_server`) with package scope `@skavan`, GitHub Packages scope alignment is satisfied.

Use npmjs registry when scope and GitHub owner do not match.

Notes:

1. The first `--` passes the release level (patch/minor/major/prerelease).
2. The second `--` passes optional flags to the script.

## Release note format

A note file is generated as:

- `docs/releases/shared-vX.Y.Z.md`

Fill these sections:

1. Summary
2. Schema Changes
3. Defaults / Validation Changes
4. Client Impact
5. Server Actions (migration yes/no)

## Server-side after release

1. Update server to new shared version (if consuming registry version).
2. Generate/apply migration when schema changed.
3. Build server and validate API flows.

## Client-side after release

1. Update client dependency to released shared version.
2. Install dependencies.
3. Run client build/dev and validate impacted screens.

In this model, client update is typically:

```bash
pnpm up @skavan/rentalzen-drizzle@X.Y.Z
pnpm install
pnpm dev
```

## Recommended team policy

1. Server validates first, client second.
2. Publish only from clean git state.
3. Every publish must include release notes.
4. Use patch/minor/major consistently.

## What changes in client repo

Client should move from local file dependency to versioned dependency:

- From: `file:../rz_server/drizzle/shared`
- To: `@skavan/rentalzen-drizzle: X.Y.Z` (or range policy)

Use local file dependency only for temporary local experiments, not default team workflow.

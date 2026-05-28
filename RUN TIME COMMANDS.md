# RUN TIME COMMANDS

Simple command sheet for day-to-day work in this repo.

## Start Here (always)

Use the exact workspace root first:

- navigate to repo root

Do not use any Code 25 path. The correct folder is Code 2025.

## Quick Repeat Flow (shared publish)

1. Set-Location "G:\Documents\Code 2025\repos\rz_server" ***
2. cd drizzle/shared
3. npm run release:shared -- patch -- --note "Short note" --skip-clean-check
4. cd ../..
5. git push origin main --follow-tags
6. npm run publish:shared
7. npm run publish:shared:status

Publish can take a minute to show completion. Wait for a checkmark before updating the client.

One-command version (prompts for release note/comment): (patch is x in 1.0.x, minor is y in 1.y.x)

- npm run publish_updated_drizzle_patch
- npm run publish_updated_drizzle_minor

One-command with note passed inline:

- npm run publish_updated_drizzle_patch -- --Note "Include bump-test doc update"
- npm run publish_updated_drizzle_minor -- --Note "Add optional vendor metadata fields"

Positional note also works:

- npm run publish_updated_drizzle_patch -- "Include bump-test doc update"

## Repo Root (rz_server)

Status and basic checks:

- git status --short
- npm run publish:shared:status

One-time machine setup for GitHub Packages auth:

- npm run setup:gh-packages-auth
- npm run setup:gh-packages-auth:sh
- npm run gh-packages-token:length

Shared publish via GitHub Actions:

- npm run publish:shared:dry
- npm run publish:shared
- npm run publish:shared:status

Utility:

- npm run sync:db-and-shared

## Server (server)

Start dev server:

- cd server
- npm run dev

Start prod server (with development flags intact)
- npm start 

PM2:
see ecosystem.config.cjs
pm2 restart ecosystem.config.cjs --only rentalzen-server
pm2 save




Build server:

- cd server
- npm run build

Install dependencies:

- cd server
- npm install

## Shared package (drizzle/shared)

Build shared package:

- cd drizzle/shared
- npm run build

Version bump and release prep:

- cd drizzle/shared
- npm run release:shared -- patch -- --note "Describe change"

Optional detail mode (prints staged shared file list, default off):

- npm run release:shared -- patch -- --note "Describe change" --detail

Note: wrapper scripts do not pass --detail by default. Use direct release:shared command when you want staged-file output.
Note: wrapper scripts use --skip-clean-check for convenience.

Release behavior:

- Automatically stages changed files under drizzle/shared for the release commit
- Blocks commit if staged files outside drizzle/shared are detected

Other bump levels:

- npm run release:shared -- minor -- --note "Describe change" --skip-clean-check
- npm run release:shared -- major -- --note "Describe change" --skip-clean-check
- npm run release:shared -- prerelease -- --note "Describe change" --skip-clean-check

The --skip-clean-check flag allows release while the repo has unrelated uncommitted changes. Remove it to require a clean tree first.

Minor case example (1.0.1 -> 1.1.0):

- npm run release:shared -- minor -- --note "Add optional vendor metadata fields and zod validators" --skip-clean-check

Minor with detail output:

- npm run release:shared -- minor -- --note "Add optional vendor metadata fields and zod validators" --skip-clean-check --detail

How to choose patch/minor/major:

- See drizzle-shared-instructions.md section: How to choose patch vs minor vs major

Dry-run release prep (no file changes):

- npm run release:shared -- patch -- --dry-run --skip-clean-check

Check package contents before publish:

- npm pack --dry-run

## Typical shared release flow

1. Build shared package
2. Run release:shared to bump version and create release note
3. Push commits/tags
4. Trigger publish dry run from root
5. Trigger real publish from root
6. Verify run in GitHub Actions and package visibility in GitHub Packages






## Client migration quick refs

Client should use package name:

- @skavan/rentalzen-drizzle

Client should not use local file dependency:

- file:../rz_server/drizzle/shared

Detailed migration guide:

- drizzle-shared-client-migration-instructions.md

Client pickup after publish:

- pnpm add @skavan/rentalzen-drizzle@<new_version>

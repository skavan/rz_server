#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED_LEVELS = new Set(['patch', 'minor', 'major', 'prerelease']);
const SHARED_PREFIX = 'drizzle/shared/';

function run(command, cwd) {
  execSync(command, { cwd, stdio: 'inherit' });
}

function runCapture(command, cwd) {
  return execSync(command, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    level: '',
    note: '',
    dryRun: false,
    publish: false,
    push: false,
    skipCleanCheck: false,
    detail: false,
  };

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    if (!options.level && ALLOWED_LEVELS.has(token)) {
      options.level = token;
      continue;
    }

    if (token === '--note') {
      options.note = args.shift() || '';
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (token === '--publish') {
      options.publish = true;
      continue;
    }

    if (token === '--push') {
      options.push = true;
      continue;
    }

    if (token === '--skip-clean-check') {
      options.skipCleanCheck = true;
      continue;
    }

    if (token === '--detail') {
      options.detail = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.level) {
    throw new Error('Missing release level. Use one of: patch|minor|major|prerelease');
  }

  return options;
}

function ensureCleanTree(repoRoot, skipCleanCheck) {
  if (skipCleanCheck) return;
  const status = runCapture('git status --porcelain', repoRoot);
  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes first, or pass --skip-clean-check.');
  }
}

function readVersion(sharedDir) {
  const packageJsonPath = join(sharedDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function createReleaseNote(sharedDir, version, note) {
  const releaseDir = join(sharedDir, 'docs', 'releases');
  if (!existsSync(releaseDir)) {
    mkdirSync(releaseDir, { recursive: true });
  }

  const filePath = join(releaseDir, `shared-v${version}.md`);
  const now = new Date().toISOString();
  const content = [
    `# Shared Release v${version}`,
    '',
    `Date: ${now}`,
    '',
    '## Summary',
    note ? `- ${note}` : '- Describe the purpose of this release.',
    '',
    '## Schema Changes',
    '- List tables/fields added/changed/removed.',
    '',
    '## Defaults / Validation Changes',
    '- List Zod default/validation behavior changes.',
    '',
    '## Client Impact',
    '- State if client update is required and any breaking changes.',
    '',
    '## Server Actions',
    '- Migration required: yes/no',
    '- If yes, migration file(s):',
    '',
  ].join('\n');

  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function stageSharedChanges(sharedDir) {
  run('git add -A .', sharedDir);
}

function getStagedPaths(repoRoot) {
  const output = runCapture('git diff --cached --name-only', repoRoot);
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureOnlySharedPathsStaged(repoRoot) {
  const stagedPaths = getStagedPaths(repoRoot);
  if (stagedPaths.length === 0) {
    throw new Error('No files are staged for release commit.');
  }

  const outsideShared = stagedPaths.filter((path) => !path.startsWith(SHARED_PREFIX));
  if (outsideShared.length > 0) {
    throw new Error(
      `Release staging includes files outside ${SHARED_PREFIX}: ${outsideShared.join(', ')}`
    );
  }

  return stagedPaths;
}

function printStagedSharedPaths(stagedPaths) {
  console.log('Staged shared files:');
  for (const path of stagedPaths) {
    console.log(`- ${path}`);
  }
  console.log('');
}

function printPlan(options) {
  console.log('');
  console.log('Release plan:');
  console.log(`- Version bump level: ${options.level}`);
  console.log(`- Create release note: yes`);
  console.log(`- Commit + tag: yes`);
  console.log(`- Publish package: ${options.publish ? 'yes' : 'no'}`);
  console.log(`- Push commit + tags: ${options.push ? 'yes' : 'no'}`);
  console.log(`- Detail output: ${options.detail ? 'yes' : 'no'}`);
  console.log(`- Dry run: ${options.dryRun ? 'yes' : 'no'}`);
  console.log('');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sharedDir = process.cwd();
  const repoRoot = runCapture('git rev-parse --show-toplevel', sharedDir);

  printPlan(options);

  ensureCleanTree(repoRoot, options.skipCleanCheck);

  if (options.dryRun) {
    console.log('Dry run complete. No files changed.');
    return;
  }

  console.log('Building shared package...');
  run('npm run build', sharedDir);

  console.log(`Bumping version (${options.level})...`);
  run(`npm version ${options.level} --no-git-tag-version`, sharedDir);
  const newVersion = readVersion(sharedDir);

  console.log(`Creating release note for v${newVersion}...`);
  const notePath = createReleaseNote(sharedDir, newVersion, options.note);

  console.log('Creating commit + tag...');
  stageSharedChanges(sharedDir);
  const stagedPaths = ensureOnlySharedPathsStaged(repoRoot);
  if (options.detail) {
    printStagedSharedPaths(stagedPaths);
  }
  run(`git commit -m "release(shared): v${newVersion}"`, sharedDir);
  run(`git tag shared-v${newVersion}`, sharedDir);

  if (options.publish) {
    console.log('Publishing package...');
    run('npm publish', sharedDir);
  }

  if (options.push) {
    console.log('Pushing commit and tags...');
    run('git push', sharedDir);
    run('git push --tags', sharedDir);
  }

  console.log('');
  console.log(`Release workflow complete: v${newVersion}`);
  console.log(`Release note: ${notePath}`);
  if (!options.publish) {
    console.log('Package was not published. Re-run with --publish when ready.');
  }
}

try {
  main();
} catch (error) {
  console.error('release-shared failed:', error.message || error);
  process.exit(1);
}

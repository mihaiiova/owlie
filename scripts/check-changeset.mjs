#!/usr/bin/env node
// Checks whether a pull request that touches user-facing code includes a
// changeset. Reads a newline-separated list of changed file paths from stdin.
//
// "User-facing" means apps/cli/** or any package's src/**. A changeset is any
// .changeset/*.md file other than the README.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const USER_FACING_PATTERNS = [/^apps\/cli\//, /^packages\/[^/]+\/src\//];
const CHANGESET_PATTERN = /^\.changeset\/[^/]+\.md$/;
const CHANGESET_README = '.changeset/README.md';

export function isUserFacing(path) {
  return USER_FACING_PATTERNS.some((pattern) => pattern.test(path));
}

export function isChangeset(path) {
  return path !== CHANGESET_README && CHANGESET_PATTERN.test(path);
}

export function shouldRequireChangeset(changedFiles) {
  return changedFiles.some(isUserFacing);
}

export function hasChangeset(changedFiles) {
  return changedFiles.some(isChangeset);
}

export function evaluate(changedFiles) {
  const requires = shouldRequireChangeset(changedFiles);
  const present = hasChangeset(changedFiles);
  return { requires, present, ok: !requires || present };
}

function run() {
  const input = readFileSync(0, 'utf8');
  const changed = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const { requires, present } = evaluate(changed);

  if (!requires) {
    console.log('No user-facing changes detected; no changeset required.');
    process.exitCode = 0;
    return;
  }

  if (present) {
    console.log('Changeset present.');
    process.exitCode = 0;
    return;
  }

  console.error(
    'User-facing changes detected (apps/cli or package src), but no new .changeset/*.md was added.\n' +
      'Run `pnpm changeset` to record the change, or add the `no-changeset` label for a deliberate exception.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

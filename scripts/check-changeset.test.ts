import { describe, expect, it } from 'vitest';

import {
  evaluate,
  hasChangeset,
  isChangeset,
  isUserFacing,
  shouldRequireChangeset,
} from './check-changeset.mjs';

describe('isUserFacing', () => {
  it('classifies apps/cli files as user-facing', () => {
    expect(isUserFacing('apps/cli/src/index.ts')).toBe(true);
    expect(isUserFacing('apps/cli/package.json')).toBe(true);
  });

  it('classifies package src files as user-facing', () => {
    expect(isUserFacing('packages/adapter-rss/src/index.ts')).toBe(true);
    expect(isUserFacing('packages/provider-deepseek/src/deepseek.ts')).toBe(true);
  });

  it('does not classify package test files as user-facing', () => {
    expect(isUserFacing('packages/adapter-rss/test/index.test.ts')).toBe(false);
  });

  it('does not classify package non-src files as user-facing', () => {
    expect(isUserFacing('packages/adapter-rss/package.json')).toBe(false);
    expect(isUserFacing('packages/adapter-rss/README.md')).toBe(false);
  });

  it('does not classify docs, workflows, or root files as user-facing', () => {
    expect(isUserFacing('docs/contributor-flow.md')).toBe(false);
    expect(isUserFacing('.github/workflows/ci.yml')).toBe(false);
    expect(isUserFacing('README.md')).toBe(false);
  });
});

describe('isChangeset', () => {
  it('recognizes a changeset file', () => {
    expect(isChangeset('.changeset/tiny-pandas-shout.md')).toBe(true);
  });

  it('does not treat the changeset README as a changeset', () => {
    expect(isChangeset('.changeset/README.md')).toBe(false);
  });

  it('does not treat files outside .changeset as changesets', () => {
    expect(isChangeset('docs/tiny-pandas-shout.md')).toBe(false);
  });
});

describe('shouldRequireChangeset', () => {
  it('requires a changeset when any user-facing file changed', () => {
    expect(shouldRequireChangeset(['apps/cli/src/index.ts'])).toBe(true);
    expect(shouldRequireChangeset(['packages/core/src/types.ts'])).toBe(true);
  });

  it('does not require a changeset for docs-only or test-only changes', () => {
    expect(shouldRequireChangeset(['docs/foo.md', 'packages/core/test/x.test.ts'])).toBe(false);
  });
});

describe('hasChangeset', () => {
  it('detects a changeset among changed files', () => {
    expect(hasChangeset(['apps/cli/src/index.ts', '.changeset/quick-bears-run.md'])).toBe(true);
  });

  it('does not count the changeset README as a changeset', () => {
    expect(hasChangeset(['.changeset/README.md'])).toBe(false);
  });
});

describe('evaluate', () => {
  it('passes when no user-facing files changed', () => {
    expect(evaluate(['docs/foo.md', 'README.md'])).toEqual({
      requires: false,
      present: false,
      ok: true,
    });
  });

  it('passes when user-facing files changed and a changeset is present', () => {
    expect(evaluate(['apps/cli/src/index.ts', '.changeset/tiny-shout.md'])).toEqual({
      requires: true,
      present: true,
      ok: true,
    });
  });

  it('fails when user-facing files changed and no changeset is present', () => {
    expect(evaluate(['packages/adapter-rss/src/index.ts'])).toEqual({
      requires: true,
      present: false,
      ok: false,
    });
  });
});

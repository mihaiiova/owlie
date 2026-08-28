import { describe, expect, it } from 'vitest';

import { isMainRef, parseSemver, validateCandidate } from './candidate.mjs';

describe('parseSemver', () => {
  it('parses a plain semver version', () => {
    expect(parseSemver('0.1.0')).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: null,
      build: null,
    });
  });

  it('parses prerelease and build metadata', () => {
    expect(parseSemver('1.2.3-beta.1+build.5')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: 'beta.1',
      build: 'build.5',
    });
  });

  it('rejects a leading v', () => {
    expect(parseSemver('v0.1.0')).toBeNull();
  });

  it('rejects missing patch', () => {
    expect(parseSemver('0.1')).toBeNull();
  });

  it('rejects leading zeros', () => {
    expect(parseSemver('01.2.3')).toBeNull();
  });

  it('rejects empty and whitespace-padded input', () => {
    expect(parseSemver('')).toBeNull();
    expect(parseSemver(' 0.1.0 ')).toBeNull();
  });
});

describe('validateCandidate', () => {
  it('accepts a matching expected and package version', () => {
    expect(validateCandidate({ expectedVersion: '0.1.0', packageVersion: '0.1.0' })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('trims surrounding whitespace on both versions', () => {
    expect(validateCandidate({ expectedVersion: ' 0.1.0 ', packageVersion: '0.1.0' })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects a version mismatch', () => {
    const result = validateCandidate({ expectedVersion: '0.1.0', packageVersion: '0.1.1' });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/does not match/i);
  });

  it('rejects an invalid expected version', () => {
    const result = validateCandidate({ expectedVersion: 'not-a-version', packageVersion: '0.1.0' });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/not a valid semantic version/i);
  });

  it('rejects an invalid package version', () => {
    const result = validateCandidate({ expectedVersion: '0.1.0', packageVersion: '' });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/package version/i);
  });

  it('collects multiple errors', () => {
    const result = validateCandidate({ expectedVersion: 'x', packageVersion: 'y' });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('isMainRef', () => {
  it('accepts the bare branch name and the full ref', () => {
    expect(isMainRef('main')).toBe(true);
    expect(isMainRef('refs/heads/main')).toBe(true);
  });

  it('rejects feature branches and tags', () => {
    expect(isMainRef('refs/heads/feature')).toBe(false);
    expect(isMainRef('refs/tags/v0.1.0')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isMainRef('')).toBe(false);
  });
});

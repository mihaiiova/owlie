import { describe, expect, it } from 'vitest';
import { isSourceType, SOURCE_TYPES } from '../src/index.js';

describe('SourceType', () => {
  it('includes every known source type, including local', () => {
    expect(SOURCE_TYPES).toEqual(['youtube', 'podcast', 'reddit', 'rss', 'article', 'local']);
  });

  it('accepts every known source type', () => {
    for (const value of SOURCE_TYPES) {
      expect(isSourceType(value)).toBe(true);
    }
  });

  it('rejects unknown, non-string, and missing source types', () => {
    expect(isSourceType('garbage')).toBe(false);
    expect(isSourceType('')).toBe(false);
    expect(isSourceType(123)).toBe(false);
    expect(isSourceType(null)).toBe(false);
    expect(isSourceType(undefined)).toBe(false);
  });
});

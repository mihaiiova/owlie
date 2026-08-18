import { describe, expect, it } from 'vitest';
import { isOutputFormat, OUTPUT_FORMATS } from '@owlieio/core';

describe('output formats', () => {
  it('recognizes the four reserved formats', () => {
    expect(OUTPUT_FORMATS).toEqual(['text', 'markdown', 'json', 'jsonl']);
    for (const format of OUTPUT_FORMATS) {
      expect(isOutputFormat(format)).toBe(true);
    }
  });

  it('rejects unknown formats', () => {
    expect(isOutputFormat('csv')).toBe(false);
    expect(isOutputFormat('')).toBe(false);
    expect(isOutputFormat(42)).toBe(false);
    expect(isOutputFormat(undefined)).toBe(false);
  });
});

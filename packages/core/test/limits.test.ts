import { describe, expect, it } from 'vitest';
import {
  assertBoundedLimit,
  ConfigurationError,
  DEFAULT_COLLECTION_LIMIT,
  MAX_COLLECTION_LIMIT,
  resolveLimit,
} from '@owlieio/core';

describe('collection limits', () => {
  it('defaults to the conservative limit of 10', () => {
    expect(DEFAULT_COLLECTION_LIMIT).toBe(10);
    expect(resolveLimit(undefined)).toBe(10);
    expect(resolveLimit(null)).toBe(10);
  });

  it('accepts an explicit positive integer', () => {
    expect(assertBoundedLimit(1)).toBe(1);
    expect(assertBoundedLimit(50)).toBe(50);
    expect(resolveLimit(3)).toBe(3);
  });

  it('rejects zero and negative values', () => {
    expect(() => assertBoundedLimit(0)).toThrow(ConfigurationError);
    expect(() => assertBoundedLimit(-5)).toThrow(ConfigurationError);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(() => assertBoundedLimit(1.5)).toThrow(ConfigurationError);
    expect(() => assertBoundedLimit(NaN)).toThrow(ConfigurationError);
    expect(() => assertBoundedLimit('10')).toThrow(ConfigurationError);
    expect(() => assertBoundedLimit(undefined)).toThrow(ConfigurationError);
  });

  it('rejects values above the maximum allowed limit', () => {
    expect(() => assertBoundedLimit(MAX_COLLECTION_LIMIT + 1)).toThrow(ConfigurationError);
    expect(() => assertBoundedLimit(10_000)).toThrow(ConfigurationError);
  });

  it('accepts the maximum allowed limit', () => {
    expect(assertBoundedLimit(MAX_COLLECTION_LIMIT)).toBe(MAX_COLLECTION_LIMIT);
  });

  it('honors a custom maximum', () => {
    expect(assertBoundedLimit(20, { max: 20 })).toBe(20);
    expect(() => assertBoundedLimit(21, { max: 20 })).toThrow(ConfigurationError);
  });
});

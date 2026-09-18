import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelInfo } from '@owlieio/core';
import { MODEL_CACHE_TTL_MS, isCacheFresh, readModelCache, writeModelCache } from 'owlie';

const models: ModelInfo[] = [{ provider: 'deepseek', id: 'deepseek-chat' }];

describe('model cache', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'owlie-cache-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const path = () => join(dir, 'models.json');

  it('round-trips a provider model list with its fetch timestamp', () => {
    const data = { deepseek: { models, fetchedAt: 1_700_000_000_000 } };
    writeModelCache(data, path());
    expect(readModelCache(path())).toEqual(data);
  });

  it('returns an empty cache when the file is missing', () => {
    expect(readModelCache(path())).toEqual({});
  });

  it('returns an empty cache when the file is corrupt', () => {
    writeFileSync(path(), 'not json');
    expect(readModelCache(path())).toEqual({});
  });

  it('drops invalid cache entries', () => {
    writeFileSync(
      path(),
      JSON.stringify({
        deepseek: { models, fetchedAt: 123 },
        broken: { models: [{ id: 'x' }] },
        notArray: { models: 'nope', fetchedAt: 123 },
      }),
    );
    expect(readModelCache(path())).toEqual({
      deepseek: { models, fetchedAt: 123 },
    });
  });
});

describe('isCacheFresh', () => {
  const now = 1_000_000_000_000;

  it('is fresh within the TTL', () => {
    expect(isCacheFresh({ models, fetchedAt: now - MODEL_CACHE_TTL_MS + 1 }, now)).toBe(true);
  });

  it('is stale at or beyond the TTL', () => {
    expect(isCacheFresh({ models, fetchedAt: now - MODEL_CACHE_TTL_MS }, now)).toBe(false);
    expect(isCacheFresh({ models, fetchedAt: now - MODEL_CACHE_TTL_MS - 1 }, now)).toBe(false);
  });

  it('is never fresh when there is no entry', () => {
    expect(isCacheFresh(undefined, now)).toBe(false);
  });
});

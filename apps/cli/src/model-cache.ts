import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ModelInfo } from '@owlieio/core';
import { cacheDir } from './config.js';

/** How long a cached model list is considered fresh. */
export const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;

/** A cached model list and when it was fetched (epoch milliseconds). */
export interface CachedModels {
  models: ModelInfo[];
  fetchedAt: number;
}

/** The model cache file shape: provider id → cached list. */
export type ModelCacheData = Record<string, CachedModels>;

/** Absolute path to the model cache file (XDG-aware cache directory). */
export function modelsCachePath(): string {
  return join(cacheDir(), 'models.json');
}

function isModelInfo(value: unknown): value is ModelInfo {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as ModelInfo).id === 'string' &&
    typeof (value as ModelInfo).provider === 'string'
  );
}

/**
 * Reads the model cache, tolerating a missing or corrupt file and dropping
 * entries that do not match the expected shape.
 */
export function readModelCache(path: string = modelsCachePath()): ModelCacheData {
  const out: ModelCacheData = {};
  try {
    if (!existsSync(path)) return out;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    for (const [provider, raw] of Object.entries(parsed)) {
      if (raw === null || typeof raw !== 'object') continue;
      const entry = raw as { models?: unknown; fetchedAt?: unknown };
      if (!Array.isArray(entry.models) || typeof entry.fetchedAt !== 'number') continue;
      const models = entry.models.filter(isModelInfo);
      out[provider] = { models, fetchedAt: entry.fetchedAt };
    }
    return out;
  } catch {
    return out;
  }
}

/** Writes the model cache with restricted permissions. */
export function writeModelCache(data: ModelCacheData, path: string = modelsCachePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

/** Whether a cached entry is still within the freshness TTL. */
export function isCacheFresh(entry: CachedModels | undefined, now: number): entry is CachedModels {
  return entry !== undefined && now - entry.fetchedAt < MODEL_CACHE_TTL_MS;
}

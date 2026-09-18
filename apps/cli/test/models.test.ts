import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelInfo, ProviderCatalog } from '@owlieio/core';
import { ExitCode, MODEL_CACHE_TTL_MS, run, writeModelCache } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

function makeCatalog(providerId: string, behavior: { models?: ModelInfo[]; error?: unknown } = {}) {
  let calls = 0;
  const catalog: ProviderCatalog = {
    providerId,
    async listModels() {
      calls += 1;
      if (behavior.error) throw behavior.error;
      return behavior.models ?? [];
    },
  };
  return { catalog, calls: () => calls };
}

const NOW = 1_000_000_000_000;

function deps(models: CliDeps['models']): CliDeps {
  return { models };
}

describe('models command', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'owlie-models-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const cachePath = () => join(dir, 'models.json');

  it('lists a brand-new model id absent from source', async () => {
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-future-model' }],
    });
    const { io, stdout } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: (id) => (id === 'deepseek' ? deepseek.catalog : makeCatalog(id).catalog),
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek-future-model');
  });

  it('lists models for all configured providers with compound refs', async () => {
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-chat' }],
    });
    const openai = makeCatalog('openai', {
      models: [{ provider: 'openai', id: 'gpt-4o-mini' }],
    });
    const catalogs: Record<string, ProviderCatalog> = {
      deepseek: deepseek.catalog,
      openai: openai.catalog,
    };
    const { io, stdout } = capture();
    const code = await run(
      ['models'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-d' },
        readConfig: () => ({ providers: { openai: { apiKey: 'sk-o' } } }),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: (id) => catalogs[id]!,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek/deepseek-chat');
    expect(stdout()).toContain('openai/gpt-4o-mini');
  });

  it('errors on an unknown provider', async () => {
    const { io, stderr } = capture();
    const code = await run(
      ['models', '--provider', 'anthropic'],
      io,
      deps({
        env: {},
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
      }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown provider');
  });

  it('errors when the selected provider has no credential', async () => {
    const { io, stderr } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek'],
      io,
      deps({
        env: {},
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
      }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('no API key');
  });

  it('uses a fresh cache without calling the provider', async () => {
    writeModelCache(
      { deepseek: { models: [{ provider: 'deepseek', id: 'deepseek-chat' }], fetchedAt: NOW } },
      cachePath(),
    );
    const deepseek = makeCatalog('deepseek');
    const { io, stdout } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek-chat');
    expect(deepseek.calls()).toBe(0);
  });

  it('falls back to a cached list with a timestamp on provider failure', async () => {
    writeModelCache(
      {
        deepseek: {
          models: [{ provider: 'deepseek', id: 'deepseek-chat' }],
          fetchedAt: NOW - MODEL_CACHE_TTL_MS,
        },
      },
      cachePath(),
    );
    const deepseek = makeCatalog('deepseek', { error: new Error('network down') });
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek-chat');
    expect(stderr()).toContain('using cached list from');
  });

  it('fails clearly when the provider is unreachable and there is no cache', async () => {
    const deepseek = makeCatalog('deepseek', { error: new Error('network down') });
    const { io, stderr } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('failed to list models');
  });

  it('--refresh bypasses a fresh cache and re-fetches', async () => {
    writeModelCache(
      { deepseek: { models: [{ provider: 'deepseek', id: 'deepseek-chat' }], fetchedAt: NOW } },
      cachePath(),
    );
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-future-model' }],
    });
    const { io, stdout } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek', '--refresh'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek-future-model');
    expect(deepseek.calls()).toBe(1);
  });

  it('emits a flat ModelInfo array with --json', async () => {
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-chat' }],
    });
    const { io, stdout } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek', '--json'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result).toEqual([{ provider: 'deepseek', id: 'deepseek-chat' }]);
  });

  it('always live-fetches in hosted mode, ignoring a fresh cache', async () => {
    writeModelCache(
      { deepseek: { models: [{ provider: 'deepseek', id: 'deepseek-chat' }], fetchedAt: NOW } },
      cachePath(),
    );
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-future-model' }],
    });
    const { io, stdout } = capture();
    const code = await run(
      ['--hosted', 'models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek-future-model');
    expect(deepseek.calls()).toBe(1);
  });

  it('does not fall back to cache on failure in hosted mode', async () => {
    writeModelCache(
      { deepseek: { models: [{ provider: 'deepseek', id: 'deepseek-chat' }], fetchedAt: NOW } },
      cachePath(),
    );
    const deepseek = makeCatalog('deepseek', { error: new Error('network down') });
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['--hosted', 'models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('failed to list models');
    expect(stdout()).not.toContain('deepseek-chat');
  });

  it('never writes the cache in hosted mode', async () => {
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-chat' }],
    });
    const { io } = capture();
    const code = await run(
      ['--hosted', 'models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        readConfig: () => ({}),
        loadFile: () => ({}),
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(existsSync(cachePath())).toBe(false);
  });

  it('resolves hosted model config from process env only', async () => {
    const deepseek = makeCatalog('deepseek', {
      models: [{ provider: 'deepseek', id: 'deepseek-chat' }],
    });
    const { io, stdout } = capture();
    const code = await run(
      ['--hosted', 'models', '--provider', 'deepseek'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-env' },
        readConfig: () => {
          throw new Error('readConfig called');
        },
        loadFile: () => {
          throw new Error('loadFile called');
        },
        cachePath: cachePath(),
        now: () => NOW,
        getCatalog: () => deepseek.catalog,
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek-chat');
  });
});

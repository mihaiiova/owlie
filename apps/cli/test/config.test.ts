import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readUserConfig, resolveDeepSeekConfig, writeUserConfig } from 'owlie';

const noFile = () => ({});
const noUserConfig = () => ({});

describe('resolveDeepSeekConfig', () => {
  it('reads DEEPSEEK_* from the environment', () => {
    const config = resolveDeepSeekConfig(
      {},
      { DEEPSEEK_API_KEY: 'sk-env', DEEPSEEK_BASE_URL: 'https://x' },
      noFile,
      noUserConfig,
    );
    expect(config.apiKey).toBe('sk-env');
    expect(config.baseUrl).toBe('https://x');
  });

  it('prefers the --model flag over DEEPSEEK_MODEL', () => {
    const config = resolveDeepSeekConfig(
      { model: 'deepseek-reasoner' },
      { DEEPSEEK_MODEL: 'deepseek-chat' },
      noFile,
      noUserConfig,
    );
    expect(config.model).toBe('deepseek-reasoner');
  });

  it('falls back to DEEPSEEK_MODEL when no flag is given', () => {
    const config = resolveDeepSeekConfig(
      {},
      { DEEPSEEK_MODEL: 'deepseek-chat' },
      noFile,
      noUserConfig,
    );
    expect(config.model).toBe('deepseek-chat');
  });

  it('lets dotenv files supply values and process env override them', () => {
    const files: Record<string, Record<string, string>> = {
      '.env': { DEEPSEEK_API_KEY: 'sk-dotenv' },
      '.env.local': { DEEPSEEK_BASE_URL: 'https://local' },
    };
    const loadFile = (path: string) => files[path] ?? {};
    const config = resolveDeepSeekConfig(
      {},
      { DEEPSEEK_API_KEY: 'sk-env' },
      loadFile,
      noUserConfig,
    );
    expect(config.apiKey).toBe('sk-env');
    expect(config.baseUrl).toBe('https://local');
  });

  it('returns undefined when nothing is set', () => {
    const config = resolveDeepSeekConfig({}, {}, noFile, noUserConfig);
    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBeUndefined();
    expect(config.model).toBeUndefined();
  });

  it('falls back to the user config file (below env)', () => {
    const config = resolveDeepSeekConfig({}, {}, noFile, () => ({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-file',
      baseUrl: 'https://x',
    }));
    expect(config.apiKey).toBe('sk-file');
    expect(config.model).toBe('deepseek-chat');
    expect(config.baseUrl).toBe('https://x');
  });

  it('lets process env override the user config', () => {
    const config = resolveDeepSeekConfig({}, { DEEPSEEK_API_KEY: 'sk-env' }, noFile, () => ({
      apiKey: 'sk-file',
    }));
    expect(config.apiKey).toBe('sk-env');
  });

  it('lets --model override the user config model', () => {
    const config = resolveDeepSeekConfig({ model: 'deepseek-reasoner' }, {}, noFile, () => ({
      model: 'deepseek-chat',
    }));
    expect(config.model).toBe('deepseek-reasoner');
  });
});

describe('user config store', () => {
  it('round-trips a config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-x' }, path);
      expect(readUserConfig(path)).toEqual({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'sk-x',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty config for a missing file', () => {
    expect(readUserConfig('/nonexistent/owlie-config.json')).toEqual({});
  });

  it('round-trips a proxy config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig(
        { provider: 'deepseek', proxy: { type: 'webshare', username: 'u', password: 'p' } },
        path,
      );
      expect(readUserConfig(path)).toEqual({
        provider: 'deepseek',
        proxy: { type: 'webshare', username: 'u', password: 'p' },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

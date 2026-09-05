import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import { readUserConfig, resolveProvider, resolveProviderSettings, writeUserConfig } from 'owlie';
import type { UserConfig } from 'owlie';

const noFile = () => ({});
const noUserConfig = () => ({});

describe('resolveProvider', () => {
  it('prefers the --provider flag over env and saved config', () => {
    expect(
      resolveProvider({ provider: 'openai' }, { OWLIE_PROVIDER: 'deepseek' }, () => ({
        provider: 'deepseek',
      })),
    ).toBe('openai');
  });

  it('prefers OWLIE_PROVIDER over the saved active provider', () => {
    expect(
      resolveProvider({}, { OWLIE_PROVIDER: 'openai' }, () => ({
        provider: 'deepseek',
      })),
    ).toBe('openai');
  });

  it('falls back to the saved active provider', () => {
    expect(resolveProvider({}, {}, () => ({ provider: 'deepseek' }))).toBe('deepseek');
  });

  it('throws when no provider is selected', () => {
    expect(() => resolveProvider({}, {}, noUserConfig)).toThrow(ConfigurationError);
  });
});

describe('resolveProviderSettings', () => {
  it('reads provider-specific variables from the environment', () => {
    const config = resolveProviderSettings(
      'deepseek',
      {},
      { DEEPSEEK_API_KEY: 'sk-env', DEEPSEEK_BASE_URL: 'https://x' },
      noFile,
      noUserConfig,
    );
    expect(config.apiKey).toBe('sk-env');
    expect(config.baseUrl).toBe('https://x');
  });

  it('isolates providers: OPENAI_* do not leak into deepseek', () => {
    const config = resolveProviderSettings(
      'deepseek',
      {},
      { OPENAI_API_KEY: 'sk-openai', DEEPSEEK_API_KEY: 'sk-deepseek' },
      noFile,
      noUserConfig,
    );
    expect(config.apiKey).toBe('sk-deepseek');
  });

  it('prefers the --model flag over the provider model variable', () => {
    const config = resolveProviderSettings(
      'deepseek',
      { model: 'deepseek-reasoner' },
      { DEEPSEEK_MODEL: 'deepseek-chat' },
      noFile,
      noUserConfig,
    );
    expect(config.model).toBe('deepseek-reasoner');
  });

  it('resolves the provider model variable when no flag is given', () => {
    const config = resolveProviderSettings(
      'deepseek',
      {},
      { DEEPSEEK_MODEL: 'deepseek-chat' },
      noFile,
      noUserConfig,
    );
    expect(config.model).toBe('deepseek-chat');
  });

  it('applies dotenv precedence: profile < .env < .env.local < --env-file < process env', () => {
    const files: Record<string, Record<string, string>> = {
      '.env': { OPENAI_API_KEY: 'sk-dotenv', OPENAI_BASE_URL: 'https://env' },
      '.env.local': { OPENAI_BASE_URL: 'https://local' },
      'custom.env': { OPENAI_API_KEY: 'sk-custom', OPENAI_MODEL: 'gpt-custom' },
    };
    const loadFile = (path: string) => files[path] ?? {};
    const config = resolveProviderSettings(
      'openai',
      { envFile: 'custom.env' },
      { OPENAI_API_KEY: 'sk-env' },
      loadFile,
      () => ({
        provider: 'openai',
        providers: { openai: { apiKey: 'sk-profile', baseUrl: 'https://profile' } },
      }),
    );
    expect(config.apiKey).toBe('sk-env');
    expect(config.baseUrl).toBe('https://local');
    expect(config.model).toBe('gpt-custom');
  });

  it('returns undefined when nothing is set', () => {
    const config = resolveProviderSettings('openai', {}, {}, noFile, noUserConfig);
    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBeUndefined();
    expect(config.model).toBeUndefined();
  });

  it('falls back to the saved provider profile (below env)', () => {
    const config = resolveProviderSettings('deepseek', {}, {}, noFile, () => ({
      provider: 'deepseek',
      providers: {
        deepseek: { model: 'deepseek-chat', apiKey: 'sk-file', baseUrl: 'https://x' },
      },
    }));
    expect(config.apiKey).toBe('sk-file');
    expect(config.model).toBe('deepseek-chat');
    expect(config.baseUrl).toBe('https://x');
  });

  it('keeps profiles isolated by provider', () => {
    const config = resolveProviderSettings('deepseek', {}, {}, noFile, () => ({
      provider: 'openai',
      providers: {
        openai: { model: 'gpt-4o', apiKey: 'sk-openai' },
        deepseek: { model: 'deepseek-chat', apiKey: 'sk-deepseek' },
      },
    }));
    expect(config.apiKey).toBe('sk-deepseek');
    expect(config.model).toBe('deepseek-chat');
  });
});

describe('user config store', () => {
  it('round-trips a canonical profile form', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig(
        {
          provider: 'deepseek',
          providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
        },
        path,
      );
      expect(readUserConfig(path)).toEqual({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates the legacy flat DeepSeek config into a profile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig(
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
          apiKey: 'sk-x',
          baseUrl: 'https://x',
        } as unknown as UserConfig,
        path,
      );
      expect(readUserConfig(path)).toEqual({
        provider: 'deepseek',
        providers: {
          deepseek: { model: 'deepseek-chat', apiKey: 'sk-x', baseUrl: 'https://x' },
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates a flat config without a provider to deepseek', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig({ model: 'deepseek-chat', apiKey: 'sk-x' } as unknown as UserConfig, path);
      expect(readUserConfig(path)).toEqual({
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing profile during flat migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig(
        {
          provider: 'deepseek',
          providers: { deepseek: { model: 'deepseek-reasoner', apiKey: 'sk-new' } },
          model: 'deepseek-chat',
          apiKey: 'sk-old',
        } as unknown as UserConfig,
        path,
      );
      expect(readUserConfig(path)).toEqual({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-reasoner', apiKey: 'sk-new' } },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty config for a missing file', () => {
    expect(readUserConfig('/nonexistent/owlie-config.json')).toEqual({});
  });

  it('round-trips a proxy config alongside profiles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig(
        {
          provider: 'deepseek',
          providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
          proxy: { type: 'webshare', username: 'u', password: 'p' },
        },
        path,
      );
      expect(readUserConfig(path)).toEqual({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
        proxy: { type: 'webshare', username: 'u', password: 'p' },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes the config file with 0600 permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owlie-config-'));
    const path = join(dir, 'config.json');
    try {
      writeUserConfig({ provider: 'deepseek', providers: { deepseek: { apiKey: 'sk-x' } } }, path);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

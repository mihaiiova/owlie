import { describe, expect, it } from 'vitest';
import { removeCredential, resolveCredentialSource, setCredential } from 'owlie';
import type { UserConfig } from 'owlie';

describe('setCredential', () => {
  it('adds an api key to the provider profile without disturbing others', () => {
    const config: UserConfig = {
      providers: { openai: { model: 'gpt-4o-mini', apiKey: 'sk-openai' } },
    };
    const next = setCredential(config, 'deepseek', 'sk-deepseek');
    expect(next.providers?.deepseek?.apiKey).toBe('sk-deepseek');
    expect(next.providers?.openai).toEqual({ model: 'gpt-4o-mini', apiKey: 'sk-openai' });
  });

  it('overwrites an existing key while preserving the model', () => {
    const config: UserConfig = {
      providers: { deepseek: { model: 'deepseek-chat', apiKey: 'old' } },
    };
    const next = setCredential(config, 'deepseek', 'new');
    expect(next.providers?.deepseek?.apiKey).toBe('new');
    expect(next.providers?.deepseek?.model).toBe('deepseek-chat');
  });
});

describe('removeCredential', () => {
  it('removes the api key but keeps the model and other providers', () => {
    const config: UserConfig = {
      providers: {
        deepseek: { model: 'deepseek-chat', apiKey: 'sk-d' },
        openai: { apiKey: 'sk-o' },
      },
    };
    const next = removeCredential(config, 'deepseek');
    expect(next.providers?.deepseek?.apiKey).toBeUndefined();
    expect(next.providers?.deepseek?.model).toBe('deepseek-chat');
    expect(next.providers?.openai?.apiKey).toBe('sk-o');
  });
});

describe('resolveCredentialSource', () => {
  const stored = (): UserConfig => ({ providers: { deepseek: { apiKey: 'sk-stored' } } });

  it('reports environment when the env var is set even if stored exists', () => {
    expect(
      resolveCredentialSource('deepseek', {}, { DEEPSEEK_API_KEY: 'sk-env' }, () => ({}), stored),
    ).toBe('environment');
  });

  it('reports stored when only the profile has a key', () => {
    expect(resolveCredentialSource('deepseek', {}, {}, () => ({}), stored)).toBe('stored');
  });

  it('reports not set when neither has a key', () => {
    expect(
      resolveCredentialSource(
        'deepseek',
        {},
        {},
        () => ({}),
        () => ({}),
      ),
    ).toBe('not set');
  });

  it('treats env-file credentials as environment', () => {
    const files: Record<string, Record<string, string>> = {
      '.env': { DEEPSEEK_API_KEY: 'sk-envfile' },
    };
    const loadFile = (path: string) => files[path] ?? {};
    expect(resolveCredentialSource('deepseek', {}, {}, loadFile, () => ({}))).toBe('environment');
  });

  it('lets --env-file override .env.local/.env', () => {
    const files: Record<string, Record<string, string>> = {
      '.env': { DEEPSEEK_API_KEY: 'sk-env' },
      'custom.env': { DEEPSEEK_API_KEY: 'sk-custom' },
    };
    const loadFile = (path: string) => files[path] ?? {};
    expect(
      resolveCredentialSource('deepseek', { envFile: 'custom.env' }, {}, loadFile, () => ({})),
    ).toBe('environment');
  });
});

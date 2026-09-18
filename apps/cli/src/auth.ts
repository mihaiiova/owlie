import { loadDotEnv, readUserConfig } from './config.js';
import type { UserConfig } from './config.js';

/**
 * Where a provider's effective credential comes from. `environment` covers the
 * process environment and environment files (which override stored values);
 * `stored` is the saved provider profile. Never carries the secret itself.
 */
export type CredentialSource = 'environment' | 'stored' | 'not set';

/**
 * The auth method a provider uses today. `apiKey` is the only method this
 * iteration; the store and `owlie auth` command are shaped so browser/OAuth
 * and device-code methods can be added later without changing the CLI shape.
 */
export type AuthMethod = 'apiKey';

/**
 * Stores an api key for a provider, preserving the rest of the profile and
 * every other provider. Pure: returns a new config; the caller persists it.
 */
export function setCredential(config: UserConfig, provider: string, apiKey: string): UserConfig {
  const existing = config.providers?.[provider] ?? {};
  return {
    ...config,
    providers: {
      ...(config.providers ?? {}),
      [provider]: { ...existing, apiKey },
    },
  };
}

/**
 * Removes a provider's stored api key, preserving its model/base URL and every
 * other provider's credentials. Pure: returns a new config.
 */
export function removeCredential(config: UserConfig, provider: string): UserConfig {
  const existing = config.providers?.[provider];
  if (!existing) return config;
  const { apiKey: _removed, ...rest } = existing;
  return {
    ...config,
    providers: {
      ...(config.providers ?? {}),
      [provider]: rest,
    },
  };
}

/**
 * Resolves the effective credential source for a provider using the existing
 * precedence: process env → explicit `--env-file` → `.env.local` → `.env` →
 * stored profile. Env-var and env-file keys both report `environment`; only
 * the saved profile reports `stored`. Injectable for deterministic tests.
 */
export function resolveCredentialSource(
  provider: string,
  options: { envFile?: string; hosted?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
  loadFile: (path: string) => Record<string, string> = loadDotEnv,
  readConfig: () => UserConfig = readUserConfig,
): CredentialSource {
  const key = `${provider.toUpperCase()}_API_KEY`;
  if (env[key]?.trim()) return 'environment';
  if (options.hosted) return 'not set';

  const merged: Record<string, string> = {};
  Object.assign(merged, loadFile('.env'));
  Object.assign(merged, loadFile('.env.local'));
  if (options.envFile) Object.assign(merged, loadFile(options.envFile));
  if (merged[key]?.trim()) return 'environment';

  const profile = readConfig().providers?.[provider];
  if (profile?.apiKey?.trim()) return 'stored';
  return 'not set';
}

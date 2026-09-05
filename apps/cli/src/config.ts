import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ConfigurationError } from '@owlieio/core';
import type { TranscriptProxy } from '@owlieio/adapter-youtube';

/** Platform-appropriate configuration directory (XDG-aware). */
export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'owlie');
}

/** Platform-appropriate cache directory (XDG-aware). */
export function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return join(base, 'owlie');
}

/**
 * Minimal `.env` file loader. No shell interpolation, no secrets vault. This is
 * the only place environment-file parsing belongs; core, adapters, and
 * providers receive explicit configuration objects instead.
 */
export function loadDotEnv(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(filePath)) return out;
  const text = readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Provider-owned saved profile: model, API key, and optional base URL. */
export interface ProviderProfile {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/** User configuration persisted by `owlie setup`. */
export interface UserConfig {
  /** Active provider id (used when no flag or `OWLIE_PROVIDER` is present). */
  provider?: string;
  /** Provider-keyed profiles. Secrets are never logged or serialized to output. */
  providers?: Record<string, ProviderProfile>;
  proxy?: TranscriptProxy;
}

/** Resolved provider settings (validated by the consumer). */
export interface ProviderEnvConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/** Absolute path to the user config file. */
export function configFilePath(): string {
  return join(configDir(), 'config.json');
}

/**
 * Reads the user config, tolerating a missing or corrupt file. Reads the
 * canonical provider-keyed profile form, and migrates the legacy flat
 * `{ provider, model, apiKey, baseUrl }` shape (DeepSeek-only) into a profile
 * so existing users keep working without an explicit re-setup.
 */
export function readUserConfig(path: string = configFilePath()): UserConfig {
  const config: UserConfig = {};
  try {
    if (!existsSync(path)) return config;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

    if (typeof parsed.provider === 'string') config.provider = parsed.provider;

    if (parsed.providers && typeof parsed.providers === 'object') {
      const profiles: Record<string, ProviderProfile> = {};
      for (const [id, raw] of Object.entries(parsed.providers as Record<string, unknown>)) {
        if (raw && typeof raw === 'object') {
          const p = raw as Record<string, unknown>;
          const profile: ProviderProfile = {};
          if (typeof p.model === 'string') profile.model = p.model;
          if (typeof p.apiKey === 'string') profile.apiKey = p.apiKey;
          if (typeof p.baseUrl === 'string') profile.baseUrl = p.baseUrl;
          profiles[id] = profile;
        }
      }
      config.providers = profiles;
    }

    // Legacy flat migration: fold top-level model/apiKey/baseUrl into the
    // active provider's profile (defaulting to deepseek, the only provider the
    // flat form could express) without overwriting an existing profile.
    const legacyModel = typeof parsed.model === 'string' ? parsed.model : undefined;
    const legacyApiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined;
    const legacyBaseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined;
    if (legacyModel !== undefined || legacyApiKey !== undefined || legacyBaseUrl !== undefined) {
      const active = config.provider ?? 'deepseek';
      const existing = config.providers?.[active] ?? {};
      const profile: ProviderProfile = { ...existing };
      if (profile.model === undefined && legacyModel !== undefined) profile.model = legacyModel;
      if (profile.apiKey === undefined && legacyApiKey !== undefined) profile.apiKey = legacyApiKey;
      if (profile.baseUrl === undefined && legacyBaseUrl !== undefined) {
        profile.baseUrl = legacyBaseUrl;
      }
      config.providers = { ...(config.providers ?? {}), [active]: profile };
    }

    if (parsed.proxy && typeof parsed.proxy === 'object') {
      const proxy = parsed.proxy as Record<string, unknown>;
      if (
        proxy.type === 'webshare' &&
        typeof proxy.username === 'string' &&
        typeof proxy.password === 'string'
      ) {
        config.proxy = { type: 'webshare', username: proxy.username, password: proxy.password };
      } else if (proxy.type === 'generic' && typeof proxy.url === 'string') {
        config.proxy = { type: 'generic', url: proxy.url };
      }
    }
  } catch {
    // ignore a missing or unreadable config file
  }
  return config;
}

/** Writes the canonical user config with restricted permissions. */
export function writeUserConfig(config: UserConfig, path: string = configFilePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Resolves the active provider id in this order: `--provider` flag →
 * `OWLIE_PROVIDER` (process env, then environment files) → saved active
 * provider. Throws {@link ConfigurationError} when none is selected; never
 * infers a provider from a model id.
 */
export function resolveProvider(
  options: { provider?: string; envFile?: string } = {},
  env: Record<string, string | undefined> = process.env,
  loadFile: (path: string) => Record<string, string> = loadDotEnv,
  readUserConfigFn: () => UserConfig = readUserConfig,
): string {
  const fromFlag = options.provider?.trim();
  if (fromFlag) return fromFlag;
  const fromEnv = env['OWLIE_PROVIDER']?.trim();
  if (fromEnv) return fromEnv;
  const merged: Record<string, string> = {};
  Object.assign(merged, loadFile('.env'));
  Object.assign(merged, loadFile('.env.local'));
  if (options.envFile) Object.assign(merged, loadFile(options.envFile));
  const fromFile = merged['OWLIE_PROVIDER']?.trim();
  if (fromFile) return fromFile;
  const active = readUserConfigFn().provider?.trim();
  if (active) return active;
  throw new ConfigurationError(
    'no provider selected: pass --provider <provider> or set OWLIE_PROVIDER',
  );
}

/**
 * Resolves settings for the chosen provider per the documented precedence:
 * `--model` flag → process env → explicit `--env-file` → `.env.local` → `.env`
 * → saved provider profile. `loadFile` and `readUserConfigFn` are injectable
 * for deterministic tests. Secret values are never logged here.
 */
export function resolveProviderSettings(
  provider: string,
  options: { model?: string; envFile?: string } = {},
  env: Record<string, string | undefined> = process.env,
  loadFile: (path: string) => Record<string, string> = loadDotEnv,
  readUserConfigFn: () => UserConfig = readUserConfig,
): ProviderEnvConfig {
  const prefix = provider.toUpperCase();
  const profile = readUserConfigFn().providers?.[provider] ?? {};
  const merged: Record<string, string> = {};
  if (profile.model) merged[`${prefix}_MODEL`] = profile.model;
  if (profile.apiKey) merged[`${prefix}_API_KEY`] = profile.apiKey;
  if (profile.baseUrl) merged[`${prefix}_BASE_URL`] = profile.baseUrl;
  Object.assign(merged, loadFile('.env'));
  Object.assign(merged, loadFile('.env.local'));
  if (options.envFile) Object.assign(merged, loadFile(options.envFile));

  const lookup = (name: string): string | undefined => env[name] ?? merged[name];
  return {
    apiKey: lookup(`${prefix}_API_KEY`),
    baseUrl: lookup(`${prefix}_BASE_URL`),
    model: options.model ?? lookup(`${prefix}_MODEL`),
  };
}

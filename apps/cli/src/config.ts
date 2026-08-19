import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
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

/** Values gathered for the DeepSeek provider (validated by the consumer). */
export interface DeepSeekEnvConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/** User configuration persisted by `owlie setup`. */
export interface UserConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  proxy?: TranscriptProxy;
}

/** Absolute path to the user config file. */
export function configFilePath(): string {
  return join(configDir(), 'config.json');
}

/** Reads the user config, tolerating a missing or corrupt file. */
export function readUserConfig(path: string = configFilePath()): UserConfig {
  const config: UserConfig = {};
  try {
    if (!existsSync(path)) return config;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (typeof parsed.provider === 'string') config.provider = parsed.provider;
    if (typeof parsed.model === 'string') config.model = parsed.model;
    if (typeof parsed.apiKey === 'string') config.apiKey = parsed.apiKey;
    if (typeof parsed.baseUrl === 'string') config.baseUrl = parsed.baseUrl;
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

/** Writes the user config with restricted permissions. */
export function writeUserConfig(config: UserConfig, path: string = configFilePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Resolves DeepSeek configuration per the documented precedence: flags →
 * process env → `.env.local` → `.env` → user config file → defaults. `loadFile`
 * and `readUserConfigFn` are injectable for deterministic tests. Secret values
 * are never logged here.
 */
export function resolveDeepSeekConfig(
  options: { model?: string; envFile?: string } = {},
  env: Record<string, string | undefined> = process.env,
  loadFile: (path: string) => Record<string, string> = loadDotEnv,
  readUserConfigFn: () => UserConfig = readUserConfig,
): DeepSeekEnvConfig {
  const user = readUserConfigFn();
  const merged: Record<string, string> = {};
  if (user.model) merged.DEEPSEEK_MODEL = user.model;
  if (user.apiKey) merged.DEEPSEEK_API_KEY = user.apiKey;
  if (user.baseUrl) merged.DEEPSEEK_BASE_URL = user.baseUrl;
  Object.assign(merged, loadFile('.env'));
  Object.assign(merged, loadFile('.env.local'));
  if (options.envFile) Object.assign(merged, loadFile(options.envFile));

  const lookup = (name: string): string | undefined => env[name] ?? merged[name];
  return {
    apiKey: lookup('DEEPSEEK_API_KEY'),
    baseUrl: lookup('DEEPSEEK_BASE_URL'),
    model: options.model ?? lookup('DEEPSEEK_MODEL'),
  };
}

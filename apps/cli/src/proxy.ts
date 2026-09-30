import type { HttpFetchFn, HttpFetcher } from '@owlieio/core';
import { ConfigurationError, DefaultHttpFetcher } from '@owlieio/core';
import type { TranscriptProxy } from '@owlieio/adapter-youtube';
import { loadDotEnv, readUserConfig } from './config.js';
import type { UserConfig } from './config.js';

/** Environment variable carrying a proxy URL (`http:`, `https:`, or `socks5:`). */
export const PROXY_URL_ENV = 'OWLIE_PROXY_URL';
/** Environment variables carrying a Webshare residential proxy username/password. */
export const WEBSHARE_USERNAME_ENV = 'OWLIE_WEBSHARE_PROXY_USERNAME';
export const WEBSHARE_PASSWORD_ENV = 'OWLIE_WEBSHARE_PROXY_PASSWORD';

/** Webshare's rotating residential endpoint, used for non-YouTube traffic. */
const WEBSHARE_HOST = 'p.webshare.io:80';
const PROXY_SCHEMES = new Set(['http:', 'https:', 'socks5:']);

/**
 * The proxy for extraction traffic. It has the same shape as the saved
 * `proxy` setting: a Webshare username/password pair or a proxy URL.
 */
export type ExtractionProxy = TranscriptProxy;

/** Where the effective proxy came from (never its value). */
export type ProxySource = 'env' | 'env-file' | 'user-config';

/** The resolved proxy and its source; `proxy` is absent when none is configured. */
export interface ResolvedProxy {
  proxy?: ExtractionProxy;
  source: ProxySource | null;
}

/** Non-secret proxy summary for `owlie doctor`. */
export interface ProxyReport {
  mode: 'none' | 'url' | 'webshare';
  source: ProxySource | null;
}

function value(vars: Record<string, string | undefined>, name: string): string | undefined {
  const raw = vars[name]?.trim();
  return raw ? raw : undefined;
}

/** Throws a {@link ConfigurationError} for an unusable proxy URL, never echoing it. */
export function assertProxyUrl(input: string, origin: string): void {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ConfigurationError(`${origin} is not a valid proxy URL`);
  }
  if (!PROXY_SCHEMES.has(url.protocol)) {
    throw new ConfigurationError(
      `${origin} must use http://, https://, or socks5:// (got ${url.protocol}//)`,
    );
  }
}

/** Reads one configuration layer's proxy variables; `undefined` when it sets none. */
function proxyFromVars(vars: Record<string, string | undefined>): ExtractionProxy | undefined {
  const url = value(vars, PROXY_URL_ENV);
  const username = value(vars, WEBSHARE_USERNAME_ENV);
  const password = value(vars, WEBSHARE_PASSWORD_ENV);
  if (url === undefined && username === undefined && password === undefined) return undefined;
  if (url !== undefined && (username !== undefined || password !== undefined)) {
    throw new ConfigurationError(
      `set either ${PROXY_URL_ENV} or ${WEBSHARE_USERNAME_ENV}/${WEBSHARE_PASSWORD_ENV}, not both`,
    );
  }
  if (url !== undefined) {
    assertProxyUrl(url, PROXY_URL_ENV);
    return { type: 'generic', url };
  }
  if (username === undefined || password === undefined) {
    throw new ConfigurationError(
      `${WEBSHARE_USERNAME_ENV} and ${WEBSHARE_PASSWORD_ENV} must be set together`,
    );
  }
  return { type: 'webshare', username, password };
}

/**
 * Resolves the extraction proxy. Each layer is read as a whole, and the first
 * layer that sets any proxy variable wins: process environment → `--env-file`
 * → `.env.local` → `.env` → saved user configuration. Hosted mode reads the
 * process environment only. Invalid or conflicting settings throw a
 * {@link ConfigurationError} that names the variables but never their values.
 */
export function resolveProxy(
  options: { hosted?: boolean; envFile?: string } = {},
  env: Record<string, string | undefined> = process.env,
  loadFile: (path: string) => Record<string, string> = loadDotEnv,
  readConfig: () => UserConfig = readUserConfig,
): ResolvedProxy {
  const fromEnv = proxyFromVars(env);
  if (fromEnv) return { proxy: fromEnv, source: 'env' };
  if (options.hosted) return { source: null };

  const files = [...(options.envFile ? [options.envFile] : []), '.env.local', '.env'];
  for (const file of files) {
    const fromFile = proxyFromVars(loadFile(file));
    if (fromFile) return { proxy: fromFile, source: 'env-file' };
  }

  const saved = readConfig().proxy;
  if (saved) {
    if (saved.type === 'generic') assertProxyUrl(saved.url, 'the saved proxy URL');
    return { proxy: saved, source: 'user-config' };
  }
  return { source: null };
}

/** Summarizes the effective proxy for diagnostics without host or credentials. */
export function proxyReport(resolved: ResolvedProxy): ProxyReport {
  if (!resolved.proxy) return { mode: 'none', source: null };
  return { mode: resolved.proxy.type === 'webshare' ? 'webshare' : 'url', source: resolved.source };
}

/**
 * The proxy URL used for non-YouTube traffic. A Webshare pair maps to
 * Webshare's rotating residential endpoint.
 */
export function proxyUrl(proxy: ExtractionProxy): string {
  if (proxy.type === 'generic') return proxy.url;
  const username = encodeURIComponent(`${proxy.username}-rotate`);
  const password = encodeURIComponent(proxy.password);
  return `http://${username}:${password}@${WEBSHARE_HOST}`;
}

/**
 * A `fetch` that sends every request through the proxy. undici is loaded only
 * when a proxy is configured, so the direct path pays nothing for it.
 */
export function proxiedFetch(proxy: ExtractionProxy): HttpFetchFn {
  const uri = proxyUrl(proxy);
  let ready: Promise<{ fetch: HttpFetchFn; dispatcher: unknown }> | undefined;
  const load = () =>
    (ready ??= import('undici').then((undici) => ({
      fetch: undici.fetch as unknown as HttpFetchFn,
      dispatcher: uri.startsWith('socks5:')
        ? new undici.Socks5ProxyAgent(uri)
        : new undici.ProxyAgent(uri),
    })));
  const fetchThroughProxy = async (input: Parameters<HttpFetchFn>[0], init?: RequestInit) => {
    const { fetch, dispatcher } = await load();
    return fetch(input, { ...init, dispatcher } as RequestInit);
  };
  return fetchThroughProxy as HttpFetchFn;
}

/** How the YouTube transcript client should reach YouTube. */
export interface YouTubeNetwork {
  /** Webshare: the library's rotating-proxy config (it rotates and retries on blocks). */
  proxy?: TranscriptProxy;
  /** A proxy URL: the same proxied fetch as other extraction traffic. */
  fetchFn?: HttpFetchFn;
}

/** The network seams every extraction adapter uses for one invocation. */
export interface ExtractionNetwork {
  resolved: ResolvedProxy;
  /** Safe fetcher for pages, feeds, lookups, and media downloads. */
  fetcher: HttpFetcher;
  youtube: YouTubeNetwork;
}

/** Injectable inputs for {@link extractionNetwork}; tests replace the fetcher. */
export interface ExtractionNetworkDeps {
  env?: Record<string, string | undefined>;
  loadFile?: (path: string) => Record<string, string>;
  readConfig?: () => UserConfig;
  /** Builds the extraction fetcher for the resolved proxy (or none). */
  createFetcher?: (proxy: ExtractionProxy | undefined) => HttpFetcher;
}

/**
 * Resolves the proxy once and builds the shared extraction fetcher. Provider
 * (LLM) traffic and model discovery never use it.
 */
export function extractionNetwork(
  options: { hosted?: boolean; envFile?: string },
  deps: ExtractionNetworkDeps = {},
): ExtractionNetwork {
  const resolved = resolveProxy(
    options,
    deps.env ?? process.env,
    deps.loadFile ?? loadDotEnv,
    deps.readConfig ?? readUserConfig,
  );
  const proxy = resolved.proxy;
  // One proxied fetch (and connection pool) serves both the fetcher and YouTube.
  const fetchFn = proxy ? proxiedFetch(proxy) : undefined;
  const fetcher =
    deps.createFetcher?.(proxy) ??
    (fetchFn ? new DefaultHttpFetcher(fetchFn) : new DefaultHttpFetcher());
  const youtube: YouTubeNetwork =
    proxy === undefined ? {} : proxy.type === 'webshare' ? { proxy } : { fetchFn };
  return { resolved, fetcher, youtube };
}

/**
 * Resolves the invocation's extraction network once, on first use, so a
 * command whose adapters are all injected never reads proxy configuration.
 */
export function lazyExtractionNetwork(
  options: { hosted?: boolean; envFile?: string },
  deps: ExtractionNetworkDeps = {},
): () => ExtractionNetwork {
  let network: ExtractionNetwork | undefined;
  return () => (network ??= extractionNetwork(options, deps));
}

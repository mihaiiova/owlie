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
const ROTATE_SUFFIX = '-rotate';
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
 * Webshare's rotating residential endpoint. Webshare's dashboard shows the
 * username with `-rotate` already on it, so the suffix is added only once.
 */
export function proxyUrl(proxy: ExtractionProxy): string {
  if (proxy.type === 'generic') return proxy.url;
  const base = proxy.username.endsWith(ROTATE_SUFFIX)
    ? proxy.username
    : `${proxy.username}${ROTATE_SUFFIX}`;
  const username = encodeURIComponent(base);
  const password = encodeURIComponent(proxy.password);
  return `http://${username}:${password}@${WEBSHARE_HOST}`;
}

/** The status a site answers when it blocks the IP a request came from. */
const BLOCKED_STATUS = 403;
/** Extra attempts after a blocked response; each leaves through a new IP. */
const BLOCKED_RETRIES = 2;
/**
 * Sources whose adapters pace their own requests (arXiv, bioRxiv/medRxiv,
 * NCBI). A retry inside one paced request would bypass that pacing, so their
 * hosts (and subdomains) are never retried here.
 */
const PACED_DOMAINS = ['arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ncbi.nlm.nih.gov'];

function isPacedHost(input: Parameters<HttpFetchFn>[0]): boolean {
  let host: string;
  try {
    const raw = typeof input === 'string' || input instanceof URL ? input : input.url;
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PACED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Options for {@link retryBlockedRequests}. */
export interface RetryBlockedOptions {
  /** Extra attempts after a blocked response (default 2). */
  retries?: number;
  /**
   * Returns the fetch for one retry. A rotating proxy picks the exit IP per
   * tunnel, so each retry needs a new connection rather than a pooled one.
   */
  freshFetch?: () => HttpFetchFn;
}

/**
 * Sends a blocked request again. Through a rotating proxy (Webshare) each
 * tunnel leaves from a different IP, and some sites block only part of those
 * IPs, so a 403 is often gone on the next attempt. Only bodiless GET and HEAD
 * requests retry, at most twice, each through a fresh tunnel; the last
 * response is returned as is, so a site that blocks every IP still reports its
 * real status. A 429, or a 403 with `Retry-After`, is rate limiting rather
 * than a blocked IP, and sources that pace their own requests are never
 * retried here: both stay with the adapters' pacing and backoff.
 */
export function retryBlockedRequests(
  fetchFn: HttpFetchFn,
  options: RetryBlockedOptions = {},
): HttpFetchFn {
  const retries = options.retries ?? BLOCKED_RETRIES;
  const retrying = async (input: Parameters<HttpFetchFn>[0], init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const retryable =
      (method === 'GET' || method === 'HEAD') && init?.body == null && !isPacedHost(input);
    let response = await fetchFn(input, init);
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const blocked = response.status === BLOCKED_STATUS && !response.headers.has('retry-after');
      if (!retryable || !blocked || init?.signal?.aborted) break;
      await response.body?.cancel().catch(() => undefined);
      response = await (options.freshFetch?.() ?? fetchFn)(input, init);
    }
    return response;
  };
  return retrying as HttpFetchFn;
}

/** Options for {@link proxiedFetch}. */
export interface ProxiedFetchOptions {
  /** Retry blocked requests through fresh tunnels (default: Webshare only). */
  retryBlocked?: boolean;
}

/**
 * A `fetch` that sends every request through the proxy. undici is loaded only
 * when a proxy is configured, so the direct path pays nothing for it. Through
 * Webshare's rotating endpoint a blocked request is retried through a new
 * tunnel, so from a new IP; a proxy URL may keep one IP, so it is not.
 */
export function proxiedFetch(
  proxy: ExtractionProxy,
  options: ProxiedFetchOptions = {},
): HttpFetchFn {
  const uri = proxyUrl(proxy);
  type Undici = typeof import('undici');
  let undiciReady: Promise<Undici> | undefined;
  const loadUndici = () => (undiciReady ??= import('undici'));
  const agent = (undici: Undici) =>
    uri.startsWith('socks5:') ? new undici.Socks5ProxyAgent(uri) : new undici.ProxyAgent(uri);
  let shared: unknown;
  const through =
    (fresh: boolean) => async (input: Parameters<HttpFetchFn>[0], init?: RequestInit) => {
      const undici = await loadUndici();
      const dispatcher = fresh ? agent(undici) : (shared ??= agent(undici));
      const fetch = undici.fetch as unknown as HttpFetchFn;
      return fetch(input, { ...init, dispatcher } as RequestInit);
    };
  const fetchThroughProxy = through(false) as HttpFetchFn;
  const retry = options.retryBlocked ?? proxy.type === 'webshare';
  return retry
    ? retryBlockedRequests(fetchThroughProxy, { freshFetch: () => through(true) as HttpFetchFn })
    : fetchThroughProxy;
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

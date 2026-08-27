import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

import { CancelledError, ConfigurationError, ExtractionError } from './errors.js';

/** Policy applied to every HTTP fetch. All fields are optional. */
export interface HttpFetchPolicy {
  /** Total request timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum number of redirects to follow. */
  maxRedirects?: number;
  /** Maximum response body size in bytes. */
  maxResponseBytes?: number;
  /** Opt in to private/local hosts; invalid, multicast, and reserved hosts remain blocked. */
  allowPrivateHosts?: boolean;
  /** Identifying User-Agent header value. */
  userAgent?: string;
}

/** A bounded text response from an HTTP(S) URL. */
export interface HttpTextResponse {
  /** Final, validated URL after redirects. */
  url: string;
  /** Declared `Content-Type` header, if the server provided one. */
  contentType: string | null;
  /** Decoded response body, capped by the fetch policy. */
  text: string;
}

/** A seam for safely fetching bounded text from an HTTP(S) URL. */
export interface HttpFetcher {
  fetch(
    url: string,
    options?: { signal?: AbortSignal; policy?: HttpFetchPolicy },
  ): Promise<HttpTextResponse>;
  fetchText(
    url: string,
    options?: { signal?: AbortSignal; policy?: HttpFetchPolicy },
  ): Promise<string>;
}

/** The platform fetch signature, injectable for offline tests. */
export type HttpFetchFn = typeof fetch;

/** Resolves a hostname to its IP address literals. Injectable for offline tests. */
export type DnsResolver = (hostname: string) => Promise<string[]>;

const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function normalizeHost(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

const PRIVATE_LOCAL_RANGES = new Set([
  'private',
  'carrierGradeNat',
  'loopback',
  'linkLocal',
  'uniqueLocal',
]);

function isAllowedIp(address: string, allowPrivateHosts = false): boolean {
  if (!ipaddr.isValid(address)) return false;
  const range = ipaddr.process(address).range();
  return range === 'unicast' || (allowPrivateHosts && PRIVATE_LOCAL_RANGES.has(range));
}

function isBlockedDestinationHost(hostname: string, allowPrivateHosts = false): boolean {
  const host = normalizeHost(hostname);
  if (host === 'localhost' || BLOCKED_HOSTNAME_SUFFIXES.some((s) => host.endsWith(s))) {
    return !allowPrivateHosts;
  }
  return ipaddr.isValid(host) && !isAllowedIp(host, allowPrivateHosts);
}

/**
 * Whether a hostname or IP literal is a non-public destination that must be
 * blocked by default (SSRF protection). Pure; makes no network calls. Literal
 * IPv4/IPv6 addresses are parsed canonically, including IPv4-mapped IPv6;
 * reserved hostname suffixes (`localhost`, `.local`, `.internal`, `.home.arpa`)
 * are blocked by name.
 */
export function isBlockedHost(hostname: string): boolean {
  return isBlockedDestinationHost(hostname);
}

/** Whether an IP address is invalid or outside globally routable unicast space. */
export function isBlockedIp(address: string): boolean {
  return !isAllowedIp(normalizeHost(address));
}

function isIpLiteral(host: string): boolean {
  return ipaddr.isValid(normalizeHost(host));
}

const defaultResolver: DnsResolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((record) => record.address);

/**
 * Resolves a hostname and throws if any resolved address is outside the
 * applicable public or explicit private/local policy. Best-effort: the check
 * runs before connect, so a DNS record can
 * still change afterwards (the documented TOCTOU window). Literal IPs are
 * skipped — they are already validated synchronously.
 */
export async function assertSafeResolvedHost(
  hostname: string,
  resolve: DnsResolver,
  options: SafeUrlOptions = {},
): Promise<void> {
  if (isIpLiteral(hostname)) return;

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch (error) {
    throw new ExtractionError(`failed to resolve hostname: ${hostname}`, { cause: error });
  }

  const blocked = addresses.find(
    (address) => !isAllowedIp(normalizeHost(address), options.allowPrivateHosts),
  );
  if (blocked !== undefined) {
    throw new ExtractionError(
      `refusing to fetch a disallowed host: ${hostname} (resolves to ${blocked})`,
    );
  }
}

export interface SafeUrlOptions {
  allowPrivateHosts?: boolean;
}

/**
 * Validates that a URL is an HTTP(S) URL whose destination is safe to fetch.
 * Throws {@link ConfigurationError} for malformed or non-HTTP(S) URLs and
 * {@link ExtractionError} for blocked hosts. Returns the parsed URL.
 */
export function assertSafeHttpUrl(url: string, options: SafeUrlOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigurationError('invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigurationError(`unsupported URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ExtractionError('refusing to fetch a URL containing credentials');
  }
  if (isBlockedDestinationHost(parsed.hostname, options.allowPrivateHosts)) {
    throw new ExtractionError(`refusing to fetch a disallowed host: ${parsed.hostname}`);
  }
  return parsed;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_USER_AGENT = 'owlie-cli';

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function readBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const body = response.body;
  if (!body) return '';
  if (signal.aborted) throw new CancelledError('fetch timed out or was cancelled');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rejectAbort: ((reason: CancelledError) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    rejectAbort?.(new CancelledError('fetch timed out or was cancelled'));
    void reader.cancel();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    let text = '';
    let total = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ExtractionError(`response body exceeded ${maxBytes} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDiagnosticUrl(url: string | URL): string {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Default {@link HttpFetcher} over `globalThis.fetch`. Enforces the SSRF
 * destination policy per hop, a redirect cap, a timeout, a response-size cap,
 * and an identifying User-Agent.
 */
export class DefaultHttpFetcher implements HttpFetcher {
  private readonly fetchFn: HttpFetchFn;
  private readonly resolve: DnsResolver;

  constructor(fetchFn: HttpFetchFn = fetch, resolve: DnsResolver = defaultResolver) {
    this.fetchFn = fetchFn;
    this.resolve = resolve;
  }

  async fetch(
    url: string,
    options: { signal?: AbortSignal; policy?: HttpFetchPolicy } = {},
  ): Promise<HttpTextResponse> {
    const policy = options.policy ?? {};
    const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const maxResponseBytes = policy.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const userAgent = policy.userAgent ?? DEFAULT_USER_AGENT;
    const allowPrivateHosts = policy.allowPrivateHosts ?? false;
    const timeoutMs = policy.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let current = url;
    let redirects = 0;

    for (;;) {
      const safeUrl = assertSafeHttpUrl(current, { allowPrivateHosts });
      await assertSafeResolvedHost(safeUrl.hostname, this.resolve, { allowPrivateHosts });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();

      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timer);
          throw new CancelledError('fetch cancelled');
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        const response = await this.fetchFn(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': userAgent },
        });

        if (isRedirect(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            throw new ExtractionError(
              `redirect response from ${formatDiagnosticUrl(current)} has no Location header`,
            );
          }
          if (redirects >= maxRedirects) {
            throw new ExtractionError(
              `too many redirects (max ${maxRedirects}) for ${formatDiagnosticUrl(url)}`,
            );
          }
          current = new URL(location, current).toString();
          redirects += 1;
          await response.body?.cancel();
          continue;
        }

        if (!response.ok) {
          throw new ExtractionError(
            `HTTP ${response.status} ${response.statusText} for ${formatDiagnosticUrl(current)}`,
          );
        }

        return {
          url: current,
          contentType: response.headers.get('content-type'),
          text: await readBody(response, maxResponseBytes, controller.signal),
        };
      } catch (error) {
        if (error instanceof CancelledError || error instanceof ExtractionError) throw error;
        if (controller.signal.aborted) {
          throw new CancelledError('fetch timed out or was cancelled', { cause: error });
        }
        throw new ExtractionError(
          `failed to fetch ${formatDiagnosticUrl(current)}: ${describe(error)}`,
          {
            cause: error,
          },
        );
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
    }
  }

  async fetchText(
    url: string,
    options: { signal?: AbortSignal; policy?: HttpFetchPolicy } = {},
  ): Promise<string> {
    return (await this.fetch(url, options)).text;
  }
}

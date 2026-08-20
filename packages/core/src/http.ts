import { CancelledError, ConfigurationError, ExtractionError } from './errors.js';

/** Policy applied to every HTTP fetch. All fields are optional. */
export interface HttpFetchPolicy {
  /** Total request timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum number of redirects to follow. */
  maxRedirects?: number;
  /** Maximum response body size in bytes. */
  maxResponseBytes?: number;
  /** Opt in to fetching private/local hosts (SSRF protection is on by default). */
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

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function parseIpv4(host: string): number[] | null {
  const match = IPV4_PATTERN.exec(host);
  if (!match) return null;
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

function isBlockedIpv4(octets: number[]): boolean {
  const a = octets[0];
  const b = octets[1];
  if (a === undefined || b === undefined) return false;
  if (a === 0 || a === 10 || a === 127) return true; // "this network", private, loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::' || h === '::1') return true;

  const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    const ipv4 = mapped[1];
    if (!ipv4) return true;
    const octets = parseIpv4(ipv4);
    return octets === null || isBlockedIpv4(octets);
  }

  const first = h.split(':')[0];
  if (first === undefined) return false;
  const value = Number.parseInt(first, 16);
  if (Number.isNaN(value)) return false;
  if ((value & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((value & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  return false;
}

/**
 * Whether a hostname or IP literal resolves into a non-public destination that
 * must be blocked by default (SSRF protection). Pure; makes no network calls.
 * Literal IPv4/IPv6 are checked directly; reserved hostname suffixes
 * (`localhost`, `.local`, `.internal`, `.home.arpa`) are blocked by name.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (host === 'localhost' || BLOCKED_HOSTNAME_SUFFIXES.some((s) => host.endsWith(s))) {
    return true;
  }

  if (host.includes(':')) return isBlockedIpv6(host);

  const octets = parseIpv4(host);
  return octets !== null && isBlockedIpv4(octets);
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
    throw new ConfigurationError(`invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigurationError(`unsupported URL protocol: ${parsed.protocol}`);
  }
  if (!options.allowPrivateHosts && isBlockedHost(parsed.hostname)) {
    throw new ExtractionError(`refusing to fetch a private or local host: ${parsed.hostname}`);
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

async function readBody(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ExtractionError(`response body exceeded ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Default {@link HttpFetcher} over `globalThis.fetch`. Enforces the SSRF
 * destination policy per hop, a redirect cap, a timeout, a response-size cap,
 * and an identifying User-Agent.
 */
export class DefaultHttpFetcher implements HttpFetcher {
  private readonly fetchFn: HttpFetchFn;

  constructor(fetchFn: HttpFetchFn = fetch) {
    this.fetchFn = fetchFn;
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
      assertSafeHttpUrl(current, { allowPrivateHosts });

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

      let response: Response;
      try {
        response = await this.fetchFn(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': userAgent },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new CancelledError('fetch timed out or was cancelled', { cause: error });
        }
        throw new ExtractionError(`failed to fetch ${current}: ${describe(error)}`, {
          cause: error,
        });
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new ExtractionError(`redirect response from ${current} has no Location header`);
        }
        if (redirects >= maxRedirects) {
          throw new ExtractionError(`too many redirects (max ${maxRedirects}) for ${url}`);
        }
        current = new URL(location, current).toString();
        redirects += 1;
        await response.body?.cancel();
        continue;
      }

      if (!response.ok) {
        throw new ExtractionError(`HTTP ${response.status} ${response.statusText} for ${current}`);
      }

      return {
        url: current,
        contentType: response.headers.get('content-type'),
        text: await readBody(response, maxResponseBytes),
      };
    }
  }

  async fetchText(
    url: string,
    options: { signal?: AbortSignal; policy?: HttpFetchPolicy } = {},
  ): Promise<string> {
    return (await this.fetch(url, options)).text;
  }
}

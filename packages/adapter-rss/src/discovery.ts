import type {
  ContentCollection,
  ContentLocator,
  HttpFetcher,
  HttpFetchPolicy,
} from '@owlieio/core';
import {
  DefaultHttpFetcher,
  assertSafeHttpUrl,
  isFeedContentType,
  isHtmlContentType,
  mediaTypeOf,
} from '@owlieio/core';
import { parseFeed, type FeedFormat } from './feed.js';

/** The fixed conventional-path probes, in the agreed order. */
export const PROBE_PATHS: readonly string[] = [
  '/feed',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml',
  '/index.xml',
];

/** The maximum number of discovery candidates returned by one discovery run. */
export const MAX_DISCOVERY_CANDIDATES = 8;

/** A single discovered feed candidate, before final collection mapping. */
export interface FeedCandidate {
  url: string;
  format: FeedFormat;
}

/** Options accepted by a feed-discovery operation. */
export interface FeedDiscoveryOptions {
  signal?: AbortSignal;
}

/** A collection adapter that can also discover feeds from supplied pages. */
export interface FeedDiscovery {
  discover(locator: ContentLocator, options?: FeedDiscoveryOptions): Promise<ContentCollection[]>;
}

/**
 * Whether a `<link rel=... type=...>` element is an eligible RSS/Atom feed
 * link, returning the implied {@link FeedFormat} (or `null` when ineligible).
 * Pure: `rel` must contain the token `alternate` and `type` must be an RSS or
 * Atom XML media type. JSON Feed and generic XML types are deliberately
 * rejected because they cannot be ranked deterministically as RSS or Atom.
 */
export function isEligibleFeedLink(
  rel: string | undefined,
  type: string | undefined,
): FeedFormat | null {
  if (!rel) return null;
  const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.includes('alternate')) return null;

  const mediaType = mediaTypeOf(type);
  if (mediaType === 'application/rss+xml') return 'rss';
  if (mediaType === 'application/atom+xml') return 'atom';
  return null;
}

/** A declared `<link>` element with its href and implied format. */
export interface DeclaredFeedLink {
  href: string | undefined;
  format: FeedFormat;
}

/** Reads the attribute values of a single `<link ...>` tag (quoted or unquoted). */
function linkAttributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    if (name !== undefined && value !== undefined) result[name.toLowerCase()] = value;
  }
  return result;
}

/**
 * Extracts eligible RSS/Atom `<link rel="alternate">` elements from HTML using
 * a constrained, non-DOM tokenizer (no browser, no script execution, no
 * recursion). Results keep document order.
 */
export function extractFeedLinks(html: string): DeclaredFeedLink[] {
  const links: DeclaredFeedLink[] = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = linkAttributes(tag[0]);
    const format = isEligibleFeedLink(attrs.rel, attrs.type);
    if (format === null) continue;
    links.push({ href: attrs.href, format });
  }
  return links;
}

/** Resolves a possibly-relative href against a base URL; `undefined` when malformed/non-HTTP(S). */
export function resolveFeedLinkHref(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    const resolved = new URL(href, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

/** Canonicalizes a feed candidate URL (drops the fragment). */
export function canonicalizeFeedCandidate(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

/** Deduplicates candidates by canonical URL, keeping the first occurrence. */
export function dedupeFeedCandidates(candidates: FeedCandidate[]): FeedCandidate[] {
  const seen = new Set<string>();
  const unique: FeedCandidate[] = [];
  for (const candidate of candidates) {
    const canonical = canonicalizeFeedCandidate(candidate.url);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    unique.push({ url: canonical, format: candidate.format });
  }
  return unique;
}

/** Caps a candidate list at {@link MAX_DISCOVERY_CANDIDATES}. */
export function capFeedCandidates(
  candidates: FeedCandidate[],
  max: number = MAX_DISCOVERY_CANDIDATES,
): FeedCandidate[] {
  return candidates.slice(0, max);
}

/**
 * Deterministically ranks candidates: RSS before Atom, preserving the input
 * order (declared link document order, then probe order) within each format.
 */
export function rankFeedCandidates(candidates: FeedCandidate[]): FeedCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.format === b.format) return 0;
    return a.format === 'rss' ? -1 : 1;
  });
}

/** Options for the {@link FeedDiscoveryService} constructor. */
export interface FeedDiscoveryServiceOptions {
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
}

/**
 * Bounded, one-hop RSS/Atom feed discovery. It fetches only the supplied page
 * (HTML/XHTML), reads eligible `<link rel="alternate">` elements with a
 * constrained tokenizer, and otherwise probes the six fixed same-origin
 * conventional paths. Every fetch goes through the injected safe fetch seam.
 */
export class FeedDiscoveryService implements FeedDiscovery {
  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;

  constructor(options: FeedDiscoveryServiceOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
  }

  async discover(
    locator: ContentLocator,
    options: FeedDiscoveryOptions = {},
  ): Promise<ContentCollection[]> {
    let pageUrl: URL;
    try {
      pageUrl = assertSafeHttpUrl(locator.url, {
        allowPrivateHosts: this.policy?.allowPrivateHosts,
      });
    } catch {
      return [];
    }

    const response = await this.fetcher.fetch(pageUrl.toString(), {
      signal: options.signal,
      policy: this.policy,
    });
    if (!isHtmlContentType(response.contentType)) {
      return [];
    }

    const declared = this.declaredCandidates(response.text, response.url);
    if (declared.length > 0) return this.toCollections(declared);

    const probed = await this.probeCandidates(response.url, options.signal);
    return this.toCollections(probed);
  }

  private declaredCandidates(html: string, baseUrl: string): FeedCandidate[] {
    const candidates: FeedCandidate[] = [];
    for (const link of extractFeedLinks(html)) {
      const resolved = resolveFeedLinkHref(link.href, baseUrl);
      if (resolved !== undefined) candidates.push({ url: resolved, format: link.format });
    }
    return candidates;
  }

  private async probeCandidates(
    baseUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<FeedCandidate[]> {
    const candidates: FeedCandidate[] = [];
    for (const path of PROBE_PATHS) {
      if (candidates.length >= MAX_DISCOVERY_CANDIDATES) break;
      const probeUrl = new URL(path, baseUrl).toString();
      try {
        const response = await this.fetcher.fetch(probeUrl, {
          signal,
          policy: this.policy,
        });
        const declaredType = response.contentType !== null && response.contentType.trim() !== '';
        if (declaredType && !isFeedContentType(response.contentType)) continue;
        const feed = await parseFeed(response.text);
        candidates.push({ url: response.url, format: feed.format });
      } catch (error) {
        // Cancellation is terminal for the invocation; only ordinary probe failures continue.
        if (signal?.aborted) throw error;
        // A failing, redirected-away, or incompatible probe is simply not a candidate.
        continue;
      }
    }
    return candidates;
  }

  private toCollections(candidates: FeedCandidate[]): ContentCollection[] {
    return rankFeedCandidates(capFeedCandidates(dedupeFeedCandidates(candidates))).map(
      (candidate) => ({
        id: `rss:feed:${candidate.url}`,
        sourceType: 'rss',
        canonicalUrl: candidate.url,
        metadata: { format: candidate.format },
      }),
    );
  }
}

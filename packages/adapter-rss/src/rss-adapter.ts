import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ContentExtractor,
  ExtractionOptions,
} from '@owlieio/core';
import type {
  ContentCollection,
  ContentItem,
  ContentLocator,
  NormalizedDocument,
} from '@owlieio/core';
import {
  assertBoundedLimit,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  type HttpFetcher,
  type HttpFetchPolicy,
} from '@owlieio/core';
import { documentFromItem, entryToItem, isFeedUrl, normalizeFeedUrl, parseFeed } from './feed.js';

/** Options accepted by the {@link RssAdapter} constructor. */
export interface RssAdapterOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  /** Fetch policy (SSRF opt-in, timeouts, redirects, size, User-Agent). */
  policy?: HttpFetchPolicy;
  /** Convenience timeout override; wins over `policy.timeoutMs`. */
  timeoutMs?: number;
}

/**
 * RSS/Atom feed adapter. Recognition and resolution are pure; `list` fetches
 * and parses the feed (bounded), and `extract` normalizes a single entry into
 * a `mediaType: 'text'` document, preferring item-carried text and only
 * re-fetching the feed as a fallback.
 */
export class RssAdapter implements CollectionAdapter, ContentExtractor {
  static readonly id = 'rss';
  readonly id = RssAdapter.id;
  readonly sourceType = 'rss' as const;

  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(options: RssAdapterOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
    this.timeoutMs = options.timeoutMs;
  }

  recognize(locator: ContentLocator): boolean {
    return isFeedUrl(locator.url) || ['rss', 'atom', 'feed'].includes(locator.hint ?? '');
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    if (!this.recognize(locator)) {
      throw new ConfigurationError(`not a recognized RSS/Atom feed URL: ${locator.url}`);
    }
    const canonicalUrl = normalizeFeedUrl(locator.url);
    return {
      id: `rss:feed:${canonicalUrl}`,
      sourceType: 'rss',
      canonicalUrl,
      metadata: { format: 'rss' },
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    assertBoundedLimit(options.limit);
    const xml = await this.fetcher.fetchText(collection.canonicalUrl, {
      signal: options.signal,
      policy: this.effectivePolicy(),
    });
    const feed = await parseFeed(xml);
    const items = feed.entries
      .slice(0, options.limit)
      .map((entry) => entryToItem(entry, collection.canonicalUrl));
    return {
      collection,
      items,
      truncated: feed.entries.length > options.limit,
    };
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    const carried = documentFromItem(item);
    if (carried) return carried;

    const feedUrl = typeof item.metadata.feedUrl === 'string' ? item.metadata.feedUrl : undefined;
    if (!feedUrl) {
      throw new ExtractionError(`RSS item has no text and no feed URL to re-fetch (${item.id})`);
    }

    const xml = await this.fetcher.fetchText(feedUrl, {
      signal: options.signal,
      policy: this.effectivePolicy(),
    });
    const feed = await parseFeed(xml);
    const entryId =
      typeof item.metadata.entryId === 'string'
        ? item.metadata.entryId
        : item.id.replace(/^rss:entry:/, '');
    const entry = feed.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new ExtractionError(`entry ${entryId} not found in feed ${feedUrl}`);
    }

    const document = documentFromItem(entryToItem(entry, feedUrl));
    if (!document) {
      throw new ExtractionError(`entry ${entryId} has no text content`);
    }
    return document;
  }

  private effectivePolicy(): HttpFetchPolicy {
    if (this.timeoutMs === undefined) return this.policy ?? {};
    return { ...(this.policy ?? {}), timeoutMs: this.timeoutMs };
  }
}

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
  HttpTextResponse,
  NormalizedDocument,
} from '@owlieio/core';
import {
  assertBoundedLimit,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  FeedEntryScanner,
  isFeedContentType,
  isHtmlContentType,
  type HttpFetcher,
  type HttpFetchPolicy,
} from '@owlieio/core';
import { documentFromItem, entryToItem, isFeedUrl, normalizeFeedUrl, parseFeed } from './feed.js';
import type { ParsedEntry, ParsedFeed } from './feed.js';
import {
  FeedDiscoveryService,
  type FeedDiscovery,
  type FeedDiscoveryOptions,
} from './discovery.js';

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
export class RssAdapter implements CollectionAdapter, ContentExtractor, FeedDiscovery {
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
    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeFeedUrl(locator.url);
    } catch {
      throw new ConfigurationError(`not a valid RSS/Atom feed URL: ${locator.url}`);
    }
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
    const order = feedOrder(options.sort);
    const { feed, truncated } =
      order === 'feed'
        ? await this.readFirstEntries(collection, options)
        : await this.readWholeFeed(collection, options);
    const entries = order === 'newest' ? newestFirst(feed.entries) : feed.entries;
    const items = entries
      .slice(0, options.limit)
      .map((entry) => entryToItem(entry, collection.canonicalUrl));
    return {
      collection: {
        ...collection,
        ...(feed.title !== undefined ? { title: feed.title } : {}),
        metadata: { ...collection.metadata, ...feed.metadata, format: feed.format },
      },
      items,
      truncated,
    };
  }

  /**
   * Reads only as much of the feed as the first `limit` entries need: the
   * download stops once the next entry starts, and the parsed prefix is the
   * result (more entries are known to follow, so it is truncated). When the
   * whole feed arrives it is parsed as usual. When the prefix can't stand in
   * for a full read (an entry in it was dropped, or it doesn't parse), the
   * feed is read again in full, so the result never depends on the cut.
   */
  private async readFirstEntries(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<{ feed: ParsedFeed; truncated: boolean }> {
    const scanner = new FeedEntryScanner(options.limit);
    const response = await this.fetchFeed(
      collection,
      options.signal,
      (text, contentType) =>
        isFeedContentType(contentType) && !isHtmlContentType(contentType) && scanner.scan(text),
    );
    scanner.scan(response.text);
    const prefix = scanner.prefix(response.text);
    if (prefix === undefined) {
      const feed = await parseFeed(response.text);
      return { feed, truncated: feed.entries.length > options.limit };
    }
    const feed = await parseFeed(prefix).catch(() => undefined);
    if (feed !== undefined && feed.entries.length >= options.limit) {
      return { feed, truncated: true };
    }
    return this.readWholeFeed(collection, options);
  }

  private async readWholeFeed(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<{ feed: ParsedFeed; truncated: boolean }> {
    const feed = await parseFeed((await this.fetchFeed(collection, options.signal)).text);
    return { feed, truncated: feed.entries.length > options.limit };
  }

  private async fetchFeed(
    collection: ContentCollection,
    signal: AbortSignal | undefined,
    stopReading?: (textSoFar: string, contentType: string | null) => boolean,
  ): Promise<HttpTextResponse> {
    const response = await this.fetcher.fetch(collection.canonicalUrl, {
      signal,
      policy: this.effectivePolicy(),
      ...(stopReading ? { stopReading } : {}),
    });
    assertFeedMediaType(response.contentType);
    return response;
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    const carried = documentFromItem(item, { fetchedAt: options.fetchedAt });
    if (carried) return carried;

    const feedUrl = typeof item.metadata.feedUrl === 'string' ? item.metadata.feedUrl : undefined;
    if (!feedUrl) {
      throw new ExtractionError(`RSS item has no text and no feed URL to re-fetch (${item.id})`);
    }

    const response = await this.fetcher.fetch(feedUrl, {
      signal: options.signal,
      policy: this.effectivePolicy(),
    });
    assertFeedMediaType(response.contentType);
    const feed = await parseFeed(response.text);
    const entryId =
      typeof item.metadata.entryId === 'string'
        ? item.metadata.entryId
        : item.id.replace(/^rss:entry:/, '');
    const entry = feed.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new ExtractionError(`entry ${entryId} not found in feed ${feedUrl}`);
    }

    const document = documentFromItem(entryToItem(entry, feedUrl), {
      fetchedAt: options.fetchedAt,
    });
    if (!document) {
      throw new ExtractionError(`entry ${entryId} has no text content`);
    }
    return document;
  }

  private effectivePolicy(): HttpFetchPolicy {
    if (this.timeoutMs === undefined) return this.policy ?? {};
    return { ...(this.policy ?? {}), timeoutMs: this.timeoutMs };
  }

  async discover(
    locator: ContentLocator,
    options: FeedDiscoveryOptions = {},
  ): Promise<ContentCollection[]> {
    return new FeedDiscoveryService({
      fetcher: this.fetcher,
      policy: this.effectivePolicy(),
    }).discover(locator, options);
  }

  async discoverFromResponse(
    response: HttpTextResponse,
    options: FeedDiscoveryOptions = {},
  ): Promise<ContentCollection[]> {
    return new FeedDiscoveryService({
      fetcher: this.fetcher,
      policy: this.effectivePolicy(),
    }).discoverFromResponse(response, options);
  }
}

/**
 * Rejects a declared non-feed media type before XML parsing. A missing or
 * empty declaration is accepted as a documented compatibility decision: a feed
 * URL without a declared media type is still parsed, while a declared
 * incompatible type is rejected.
 */
function assertFeedMediaType(contentType: string | null): void {
  const declared = contentType !== null && contentType.trim() !== '';
  if (declared && !isFeedContentType(contentType)) {
    throw new ExtractionError(
      `refusing to parse a feed with an incompatible content type: ${contentType ?? '(none)'}`,
    );
  }
}

/** Entry orders a feed listing accepts through `CollectionListOptions.sort`. */
export type FeedOrder = 'feed' | 'newest';

function feedOrder(sort: string | undefined): FeedOrder {
  if (sort === undefined) return 'feed';
  if (sort === 'feed' || sort === 'newest') return sort;
  throw new ConfigurationError(`unsupported feed order "${sort}" (use "feed" or "newest")`);
}

/**
 * Dated entries newest first (stable for equal dates), then undated entries
 * in feed order.
 */
function newestFirst(entries: ParsedEntry[]): ParsedEntry[] {
  const dated = entries.filter((entry) => entry.publishedAt !== undefined);
  const undated = entries.filter((entry) => entry.publishedAt === undefined);
  const time = (entry: ParsedEntry) => Date.parse(entry.publishedAt!);
  return [...dated.sort((a, b) => time(b) - time(a)), ...undated];
}

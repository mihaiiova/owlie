import type {
  CollectionAdapter,
  ContentCollection,
  ContentItem,
  ContentLocator,
  HttpTextResponse,
  ItemAdapter,
  NormalizedDocument,
  ProgressSink,
} from '@owlieio/core';
import { assertNoUrlCredentials, ConfigurationError, OwlieError } from '@owlieio/core';
import { extractWithFallback } from './dispatch.js';

/**
 * Item metadata keys safe to expose in listings and batch records: identity
 * and typed media facts only, never feed-provided HTML or internal fields.
 */
export const LISTED_ITEM_METADATA_KEYS: readonly string[] = [
  'entryId',
  'entryIdSource',
  'enclosures',
  'media',
  'enclosureUrl',
  'duration',
  'categories',
];

/** The allowlisted, HTML-free metadata of a listed item. */
export function listedItemMetadata(item: ContentItem): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const key of LISTED_ITEM_METADATA_KEYS) {
    if (item.metadata[key] !== undefined) metadata[key] = item.metadata[key];
  }
  return metadata;
}

/** A successfully extracted linked item, keyed by its URL and title. */
export interface LinkedItemResult {
  url: string;
  title?: string;
  document: NormalizedDocument;
}

/**
 * Dispatches one linked URL through the universal specialized-then-article
 * rule and extracts it into a {@link NormalizedDocument}. Throws on an
 * unrecognized URL or an extraction failure; cancellation propagates.
 */
export async function extractLinkedItem(opts: {
  url: string;
  title?: string;
  /** The listed feed entry; its metadata is carried as `metadata.feedEntry`. */
  entry?: ContentItem;
  itemAdapters: readonly ItemAdapter[];
  signal?: AbortSignal;
  progress?: ProgressSink;
  clock?: () => Date;
}): Promise<LinkedItemResult> {
  assertNoUrlCredentials(opts.url);
  const { document } = await extractWithFallback(
    opts.itemAdapters,
    { url: opts.url },
    {
      signal: opts.signal,
      progress: opts.progress,
      clock: opts.clock,
    },
  );
  const withEntry: NormalizedDocument =
    opts.entry === undefined
      ? document
      : {
          ...document,
          metadata: {
            ...document.metadata,
            feedEntry: {
              ...listedItemMetadata(opts.entry),
              ...(opts.entry.publishedAt !== undefined
                ? { publishedAt: opts.entry.publishedAt }
                : {}),
            },
          },
        };
  return {
    url: opts.url,
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    document: withEntry,
  };
}

/** A `{ url, title }` reference; title is omitted when absent. */
export function itemRef(url: string, title: string | undefined): { url: string; title?: string } {
  assertNoUrlCredentials(url);
  return title === undefined ? { url } : { url, title };
}

/** A structured batch error with a stable code, message, and stage. */
export function toBatchError<S extends 'extraction' | 'processing'>(
  error: unknown,
  stage: S,
): { code: string; message: string; stage: S } {
  const code =
    error instanceof OwlieError
      ? error.code
      : stage === 'extraction'
        ? 'EXTRACTION_ERROR'
        : 'PROCESSING_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  return { code, message, stage };
}

/** A collection adapter that may also discover feeds from supplied pages. */
export interface FeedDiscoveryCapable extends CollectionAdapter {
  discover(
    locator: ContentLocator,
    options?: { signal?: AbortSignal },
  ): Promise<ContentCollection[]>;
}

/** Whether an adapter can discover a feed from a supplied page. */
export function canDiscoverFeed(adapter: CollectionAdapter): adapter is FeedDiscoveryCapable {
  return typeof (adapter as Partial<FeedDiscoveryCapable>).discover === 'function';
}

/** A discovery-capable adapter that can also read an already fetched page. */
export interface ResponseFeedDiscoveryCapable extends FeedDiscoveryCapable {
  discoverFromResponse(
    response: HttpTextResponse,
    options?: { signal?: AbortSignal },
  ): Promise<ContentCollection[]>;
}

/**
 * Discovers the top-ranked feed URL from an already fetched page, without
 * fetching it again when the adapter supports that; otherwise it falls back to
 * page-URL discovery. `undefined` when no feed is discoverable.
 */
export async function discoverFeedUrlFromResponse(
  adapter: CollectionAdapter,
  response: HttpTextResponse,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (
    typeof (adapter as Partial<ResponseFeedDiscoveryCapable>).discoverFromResponse === 'function'
  ) {
    const discovered = await (adapter as ResponseFeedDiscoveryCapable).discoverFromResponse(
      response,
      { signal },
    );
    return discovered[0]?.canonicalUrl;
  }
  if (!canDiscoverFeed(adapter)) return undefined;
  return discoverFeedUrl(adapter, response.url, signal);
}

/** Discovers the top-ranked feed URL, or `undefined` when none is discoverable. */
export async function discoverFeedUrl(
  adapter: FeedDiscoveryCapable,
  url: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const discovered = await adapter.discover({ url }, { signal });
  return discovered[0]?.canonicalUrl;
}

/**
 * Resolves the feed URL a collection-capable command should list: a direct
 * recognized feed URL is used unchanged; otherwise discovery is attempted.
 * Throws a clear {@link ConfigurationError} when no feed is discoverable.
 */
export async function resolveFeedCollectionUrl(
  adapter: CollectionAdapter,
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  if (adapter.recognize({ url })) return url;
  if (!canDiscoverFeed(adapter)) {
    throw new ConfigurationError(`no RSS/Atom feed discoverable from ${url}`);
  }
  const discovered = await discoverFeedUrl(adapter, url, signal);
  if (discovered === undefined) {
    throw new ConfigurationError(`no RSS/Atom feed discoverable from ${url}`);
  }
  return discovered;
}

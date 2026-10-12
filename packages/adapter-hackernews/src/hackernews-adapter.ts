import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ContentCollection,
  ContentItem,
  ContentLocator,
  ExtractionOptions,
  ExtractionWarning,
  HttpFetcher,
  HttpFetchPolicy,
  ItemAdapter,
  NormalizedDocument,
  ResolutionOptions,
} from '@owlieio/core';
import {
  assertBoundedLimit,
  assertSafeHttpUrl,
  buildProvenance,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  extractionFetchedAt,
  isJsonContentType,
} from '@owlieio/core';
import {
  HACKER_NEWS_API_BASE_URL,
  hackerNewsHtmlToText,
  hackerNewsItemId,
  hackerNewsItemUrl,
  hackerNewsKind,
  LIST_ENDPOINTS,
  parseHackerNewsUrl,
  renderDiscussion,
  type HackerNewsComment,
  type HackerNewsKind,
  type HackerNewsList,
} from './hackernews.js';

/** Bounds on the comment tree read for one discussion. */
export interface HackerNewsCommentBounds {
  /** Top-level comments read, in HN's ranked order. */
  maxTopLevelComments: number;
  /** Reply levels read; 1 means top-level comments only. */
  depth: number;
  /** Comments read in total across all levels. */
  maxComments: number;
}

/** Default comment bounds: top-level comments and their direct replies. */
export const DEFAULT_COMMENT_BOUNDS: Readonly<HackerNewsCommentBounds> = {
  maxTopLevelComments: 30,
  depth: 2,
  maxComments: 100,
};

/** Hard maximums for each comment bound. */
export const MAX_COMMENT_BOUNDS: Readonly<HackerNewsCommentBounds> = {
  maxTopLevelComments: 100,
  depth: 3,
  maxComments: 300,
};

/** Item fetches per listed story allowed before a listing stops looking. */
export const LIST_FETCH_FACTOR = 3;

/** Item fetches in flight at once. */
const FETCH_CONCURRENCY = 5;

export interface HackerNewsAdapterOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  /** Fetch policy (proxy-agnostic: timeouts, size, byte budget). */
  policy?: HttpFetchPolicy;
  /** API base URL; defaults to the official Hacker News API. */
  apiBaseUrl?: string;
  /** Comment bounds for discussion documents; defaults to {@link DEFAULT_COMMENT_BOUNDS}. */
  comments?: Partial<HackerNewsCommentBounds>;
}

/** The subset of an official API item this adapter reads. */
interface ApiItem {
  id: number;
  type?: string;
  by?: string;
  time?: number;
  text?: string;
  url?: string;
  title?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
}

interface ApiUser {
  id: string;
  submitted?: number[];
}

/** A Hacker News post, as read from the official API. */
export interface HackerNewsStory {
  hnId: number;
  kind: HackerNewsKind;
  title: string;
  /** The HN item page. */
  hnUrl: string;
  /** The external link, after safe-URL validation; absent for text posts. */
  linkUrl?: string;
  author?: string;
  score?: number;
  commentCount?: number;
  publishedAt?: string;
  /** The post's own text (Ask/Show/job), as plain text. */
  text?: string;
  /** Ranked top-level comment ids. */
  commentIds: number[];
}

/** The outcome of reading a bounded comment tree. */
interface CommentTree {
  comments: HackerNewsComment[];
  included: number;
}

/** Validates a bound against its maximum; throws {@link ConfigurationError}. */
function resolveBound(name: keyof HackerNewsCommentBounds, value: number | undefined): number {
  const resolved = value ?? DEFAULT_COMMENT_BOUNDS[name];
  const max = MAX_COMMENT_BOUNDS[name];
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > max) {
    throw new ConfigurationError(`${name} must be an integer from 1 to ${max}, received ${value}`);
  }
  return resolved;
}

/** Resolves partial comment bounds against the defaults and maximums. */
export function resolveCommentBounds(
  bounds: Partial<HackerNewsCommentBounds> = {},
): HackerNewsCommentBounds {
  return {
    maxTopLevelComments: resolveBound('maxTopLevelComments', bounds.maxTopLevelComments),
    depth: resolveBound('depth', bounds.depth),
    maxComments: resolveBound('maxComments', bounds.maxComments),
  };
}

function isUsable(item: ApiItem | null): item is ApiItem {
  return item !== null && item.deleted !== true && item.dead !== true;
}

function isListable(item: ApiItem | null): item is ApiItem {
  return isUsable(item) && (item.type === 'story' || item.type === 'job' || item.type === 'poll');
}

function isoTime(seconds: number | undefined): string | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : undefined;
}

function safeLinkUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return assertSafeHttpUrl(url).toString();
  } catch {
    return undefined;
  }
}

function toStory(item: ApiItem, list?: HackerNewsList): HackerNewsStory {
  const story: HackerNewsStory = {
    hnId: item.id,
    kind: hackerNewsKind(item.type, item.title, list),
    title: item.title ?? `Hacker News item ${item.id}`,
    hnUrl: hackerNewsItemUrl(item.id),
    commentIds: item.kids ?? [],
  };
  const linkUrl = safeLinkUrl(item.url);
  if (linkUrl) story.linkUrl = linkUrl;
  if (item.by) story.author = item.by;
  if (typeof item.score === 'number') story.score = item.score;
  if (typeof item.descendants === 'number') story.commentCount = item.descendants;
  const publishedAt = isoTime(item.time);
  if (publishedAt) story.publishedAt = publishedAt;
  const text = hackerNewsHtmlToText(item.text);
  if (text) story.text = text;
  return story;
}

/** The listed/extracted metadata facts of a story. */
export function storyMetadata(story: HackerNewsStory): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    hnId: story.hnId,
    kind: story.kind,
    platform: 'hackernews',
  };
  if (story.score !== undefined) metadata.score = story.score;
  if (story.commentCount !== undefined) metadata.commentCount = story.commentCount;
  if (story.linkUrl !== undefined) metadata.linkUrl = story.linkUrl;
  return metadata;
}

/** Runs `task` over `values` with bounded concurrency, keeping input order. */
async function mapConcurrent<T, R>(
  values: readonly T[],
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await task(values[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Hacker News adapter over the official API (no key). Lists the front page,
 * newest, best, Ask HN, Show HN, and a user's submitted stories, and extracts
 * an item as a discussion document: the post and a bounded comment tree.
 * Recognition is pure; `/rss` is left to the RSS adapter.
 */
export class HackerNewsAdapter implements CollectionAdapter, ItemAdapter {
  static readonly id = 'hackernews';
  readonly id = HackerNewsAdapter.id;
  readonly sourceType = 'hackernews' as const;

  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;
  private readonly apiBaseUrl: string;
  private readonly bounds: HackerNewsCommentBounds;

  constructor(options: HackerNewsAdapterOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
    this.apiBaseUrl = (options.apiBaseUrl ?? HACKER_NEWS_API_BASE_URL).replace(/\/+$/, '');
    this.bounds = resolveCommentBounds(options.comments);
  }

  recognize(locator: ContentLocator): boolean {
    return parseHackerNewsUrl(locator.url) !== null;
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    const location = parseHackerNewsUrl(locator.url);
    if (location === null) {
      throw new ConfigurationError(`not a Hacker News URL: ${locator.url}`);
    }
    if (location.kind === 'item') {
      throw new ConfigurationError(
        `not a Hacker News list URL: ${location.itemId} is an item (use "owlie extract")`,
      );
    }
    if (location.kind === 'user') {
      return {
        id: location.collectionId,
        sourceType: 'hackernews',
        canonicalUrl: location.canonicalUrl,
        title: `Hacker News: ${location.user}'s submissions`,
        metadata: { platform: 'hackernews', user: location.user },
      };
    }
    return {
      id: location.collectionId,
      sourceType: 'hackernews',
      canonicalUrl: location.canonicalUrl,
      title: `Hacker News: ${LIST_TITLES[location.list]}`,
      metadata: { platform: 'hackernews', list: location.list },
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    const limit = assertBoundedLimit(options.limit);
    const list = collection.metadata.list as HackerNewsList | undefined;
    const user = collection.metadata.user as string | undefined;
    let ids: number[];
    if (list !== undefined && LIST_ENDPOINTS[list] !== undefined) {
      ids = await this.getIds(`${this.apiBaseUrl}/${LIST_ENDPOINTS[list]}.json`, options.signal);
    } else if (typeof user === 'string' && user !== '') {
      const record = await this.getJson<ApiUser | null>(
        `${this.apiBaseUrl}/user/${encodeURIComponent(user)}.json`,
        options.signal,
      );
      if (record === null) throw new ExtractionError(`Hacker News user not found: ${user}`);
      ids = Array.isArray(record.submitted) ? record.submitted : [];
    } else {
      throw new ConfigurationError(`not a Hacker News collection: ${collection.id}`);
    }

    // Fetch in list order until `limit` stories are found, never more than
    // `limit × LIST_FETCH_FACTOR` items (a user's submissions are mostly comments).
    const fetchCap = limit * LIST_FETCH_FACTOR;
    const items: ContentItem[] = [];
    let consumed = 0;
    while (items.length < limit && consumed < ids.length && consumed < fetchCap) {
      const batchSize = Math.min(FETCH_CONCURRENCY, ids.length - consumed, fetchCap - consumed);
      const batch = ids.slice(consumed, consumed + batchSize);
      const fetched = await mapConcurrent(batch, (id) => this.getItem(id, options.signal));
      for (const [index, item] of fetched.entries()) {
        if (items.length >= limit) {
          // Unused fetched ids stay unconsumed so `truncated` reflects them.
          consumed -= batch.length - index;
          break;
        }
        if (isListable(item)) items.push(this.toContentItem(toStory(item, list)));
      }
      consumed += batch.length;
    }

    const fetchCapReached = items.length < limit && consumed >= fetchCap && consumed < ids.length;
    return {
      collection: fetchCapReached
        ? { ...collection, metadata: { ...collection.metadata, fetchCapReached: true } }
        : collection,
      items,
      truncated: consumed < ids.length,
    };
  }

  async resolveItem(locator: ContentLocator, _options?: ResolutionOptions): Promise<ContentItem> {
    const location = parseHackerNewsUrl(locator.url);
    if (location === null) {
      throw new ConfigurationError(`not a Hacker News URL: ${locator.url}`);
    }
    if (location.kind !== 'item') {
      throw new ConfigurationError(
        `not a Hacker News item URL (a list; use "owlie list"): ${location.canonicalUrl}`,
      );
    }
    return {
      id: location.itemId,
      sourceType: 'hackernews',
      canonicalUrl: location.canonicalUrl,
      metadata: { hnId: location.id, platform: 'hackernews' },
    };
  }

  /**
   * Reads one post without its comments. Throws {@link ExtractionError} for a
   * missing, deleted or dead item, or for a comment.
   */
  async fetchStory(item: ContentItem, options: ExtractionOptions = {}): Promise<HackerNewsStory> {
    const hnId = item.metadata.hnId;
    if (typeof hnId !== 'number' || !Number.isInteger(hnId)) {
      throw new ExtractionError(`Hacker News item is missing an hnId (${item.id})`);
    }
    const record = await this.getItem(hnId, options.signal);
    if (record === null) throw new ExtractionError(`Hacker News item ${hnId} does not exist`);
    if (record.deleted === true) throw new ExtractionError(`Hacker News item ${hnId} is deleted`);
    if (record.dead === true) throw new ExtractionError(`Hacker News item ${hnId} is dead`);
    if (record.type === 'comment' || record.type === 'pollopt') {
      throw new ExtractionError(`Hacker News item ${hnId} is a ${record.type}, not a story`);
    }
    return toStory(record);
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    const target = item.id;
    options.progress?.emit({ type: 'started', target });
    try {
      const story = await this.fetchStory(item, options);
      const tree = await this.readComments(story.commentIds, options.signal);
      const text = renderDiscussion(story, tree.comments);
      const warnings: ExtractionWarning[] = [];
      const omitted = Math.max(0, (story.commentCount ?? tree.included) - tree.included);
      if (omitted > 0) {
        warnings.push({
          code: 'HN_COMMENTS_TRUNCATED',
          message: `${omitted} comment(s) not included (comment bounds reached, or deleted or dead)`,
        });
      }
      const document: NormalizedDocument = {
        schemaVersion: 2,
        id: hackerNewsItemId(story.hnId),
        sourceType: 'hackernews',
        canonicalUrl: story.hnUrl,
        mediaType: 'text',
        title: story.title,
        text,
        ...(story.publishedAt ? { publishedAt: story.publishedAt } : {}),
        ...(story.author ? { author: story.author } : {}),
        metadata: {
          ...storyMetadata(story),
          hnContent: 'discussion',
          commentsIncluded: tree.included,
          commentsOmitted: omitted,
        },
        provenance: buildProvenance({
          sourceId: hackerNewsItemId(story.hnId),
          canonicalUrl: story.hnUrl,
          adapterId: HackerNewsAdapter.id,
          text,
          fetchedAt: extractionFetchedAt(options),
          warnings,
        }),
      };
      options.progress?.emit({ type: 'completed', target, result: document });
      return document;
    } catch (error) {
      if (error instanceof CancelledError) {
        options.progress?.emit({ type: 'cancelled', target });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        options.progress?.emit({ type: 'failed', target, error: message });
      }
      throw error;
    }
  }

  /**
   * Reads the comment tree level by level in HN's ranked order: up to
   * `maxTopLevelComments` top-level comments, then replies to `depth` levels,
   * stopping after `maxComments` comment fetches in total. Deleted and dead
   * comments are skipped but still count, so requests stay bounded.
   */
  private async readComments(
    topLevelIds: readonly number[],
    signal: AbortSignal | undefined,
  ): Promise<CommentTree> {
    const roots: HackerNewsComment[] = [];
    let included = 0;
    // Every fetched comment uses budget, usable or not, so requests stay within `maxComments`.
    let fetchedCount = 0;
    let level: Array<{ id: number; siblings: HackerNewsComment[] }> = topLevelIds
      .slice(0, this.bounds.maxTopLevelComments)
      .map((id) => ({ id, siblings: roots }));

    for (let depth = 1; depth <= this.bounds.depth && level.length > 0; depth++) {
      const remaining = this.bounds.maxComments - fetchedCount;
      if (remaining <= 0) break;
      const wanted = level.slice(0, remaining);
      fetchedCount += wanted.length;
      const fetched = await mapConcurrent(wanted, (entry) => this.getItem(entry.id, signal));
      const nextLevel: typeof level = [];
      for (const [index, record] of fetched.entries()) {
        if (!isUsable(record) || record.type !== 'comment') continue;
        const comment: HackerNewsComment = {
          author: record.by ?? 'unknown',
          text: hackerNewsHtmlToText(record.text),
          replies: [],
        };
        wanted[index]!.siblings.push(comment);
        included++;
        for (const kid of record.kids ?? []) nextLevel.push({ id: kid, siblings: comment.replies });
      }
      level = nextLevel;
    }
    return { comments: roots, included };
  }

  private toContentItem(story: HackerNewsStory): ContentItem {
    const item: ContentItem = {
      id: hackerNewsItemId(story.hnId),
      sourceType: 'hackernews',
      canonicalUrl: story.hnUrl,
      title: story.title,
      metadata: storyMetadata(story),
    };
    if (story.publishedAt) item.publishedAt = story.publishedAt;
    if (story.author) item.author = story.author;
    return item;
  }

  private async getItem(id: number, signal: AbortSignal | undefined): Promise<ApiItem | null> {
    const record = await this.getJson<ApiItem | null>(`${this.apiBaseUrl}/item/${id}.json`, signal);
    if (record === null) return null;
    if (typeof record !== 'object' || typeof record.id !== 'number') {
      throw new ExtractionError(`unexpected Hacker News API response for item ${id}`);
    }
    return record;
  }

  private async getIds(url: string, signal: AbortSignal | undefined): Promise<number[]> {
    const ids = await this.getJson<unknown>(url, signal);
    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
      throw new ExtractionError('unexpected Hacker News API list response');
    }
    return ids as number[];
  }

  private async getJson<T>(url: string, signal: AbortSignal | undefined): Promise<T> {
    if (signal?.aborted) throw new CancelledError('extraction cancelled');
    const response = await this.fetcher.fetch(url, { signal, policy: this.policy });
    if (!isJsonContentType(response.contentType)) {
      throw new ExtractionError(
        `Hacker News API returned ${response.contentType ?? 'no content type'}, expected JSON`,
      );
    }
    try {
      return JSON.parse(response.text) as T;
    } catch (error) {
      throw new ExtractionError('Hacker News API returned invalid JSON', { cause: error });
    }
  }
}

const LIST_TITLES: Readonly<Record<HackerNewsList, string>> = {
  top: 'Front page',
  new: 'Newest',
  best: 'Best',
  ask: 'Ask HN',
  show: 'Show HN',
};

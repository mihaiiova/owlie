export type RedditSort = 'new' | 'hot' | 'top' | 'rising' | 'controversial' | 'best';
export type RedditPeriod = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

export const DEFAULT_REDDIT_SORT: RedditSort = 'new';
export const DEFAULT_REDDIT_TOP_PERIOD: RedditPeriod = 'week';

const ALLOWED_SORTS = new Set<string>(['new', 'hot', 'top', 'rising', 'controversial', 'best']);

export interface SubredditLocator {
  /** Lowercased subreddit name, used in stable identities. */
  subreddit: string;
  /** Stable collection identity, e.g. `reddit:subreddit:localllama`. */
  collectionId: string;
  /** Canonical subreddit URL. */
  canonicalUrl: string;
}

export function subredditCollectionId(subreddit: string): string {
  return `reddit:subreddit:${subreddit.toLowerCase()}`;
}

export function canonicalSubredditUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${subreddit.toLowerCase()}/`;
}

/**
 * Recognizes and normalizes a subreddit URL. Accepts `reddit.com`, `www`,
 * `old`, and `new` hosts, with optional `/new`, `/hot`, `/top`, `/rising`
 * (and other sort) qualifiers and/or a trailing `.rss`. Pure; no network.
 *
 * Returns `null` for URLs that are not subreddit collection locators (for
 * example, a post or comment permalink).
 */
export function normalizeSubredditUrl(input: string): SubredditLocator | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (host !== 'reddit.com' && !host.endsWith('.reddit.com')) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0]?.toLowerCase() !== 'r') return null;

  const subredditRaw = segments[1];
  if (!subredditRaw || !/^[a-z0-9_]+$/i.test(subredditRaw)) return null;
  const subreddit = subredditRaw.toLowerCase();

  let tail = segments.slice(2);
  if (tail.length > 0 && tail[tail.length - 1]?.toLowerCase() === '.rss') {
    tail = tail.slice(0, -1);
  }
  if (tail.length > 1) return null;
  if (tail.length === 1) {
    const sort = tail[0];
    if (!sort || !ALLOWED_SORTS.has(sort.toLowerCase())) return null;
  }

  return {
    subreddit,
    collectionId: subredditCollectionId(subreddit),
    canonicalUrl: canonicalSubredditUrl(subreddit),
  };
}

/**
 * Derives a public Reddit Atom feed URL for a subreddit and sort. The `period`
 * qualifier applies to `top` (and defaults to `week`).
 */
export function deriveSubredditFeedUrl(
  subreddit: string,
  sort: RedditSort = DEFAULT_REDDIT_SORT,
  period?: RedditPeriod,
): string {
  const name = subreddit.toLowerCase();
  if (sort === 'top') {
    return `https://www.reddit.com/r/${name}/top/.rss?t=${period ?? DEFAULT_REDDIT_TOP_PERIOD}`;
  }
  return `https://www.reddit.com/r/${name}/${sort}/.rss`;
}

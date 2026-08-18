import type { CollectionAdapter, CollectionListOptions, CollectionListResult } from '@owlieio/core';
import type { ContentCollection, ContentLocator } from '@owlieio/core';
import { assertBoundedLimit, ConfigurationError, NotImplementedError } from '@owlieio/core';
import { parseFeed, type ParsedFeed } from '@owlieio/adapter-rss';
import {
  DEFAULT_REDDIT_SORT,
  deriveSubredditFeedUrl,
  normalizeSubredditUrl,
  type RedditPeriod,
  type RedditSort,
} from './reddit.js';

/**
 * Parses a subreddit's Atom response by reusing the RSS adapter's parser.
 * Reddit metadata interpretation (mapping Atom entries to Reddit post fields)
 * remains this package's responsibility.
 */
export function parseSubredditFeed(xml: string): Promise<ParsedFeed> {
  return parseFeed(xml);
}

/**
 * Reddit subreddit adapter. Uses RSS/Atom transport only. Recognition and
 * resolution are pure; `list` requires fetching and is not implemented in this
 * scaffold.
 */
export class RedditAdapter implements CollectionAdapter {
  readonly id = 'reddit';
  readonly sourceType = 'reddit' as const;

  recognize(locator: ContentLocator): boolean {
    return normalizeSubredditUrl(locator.url) !== null;
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    const parsed = normalizeSubredditUrl(locator.url);
    if (!parsed) {
      throw new ConfigurationError(`not a Reddit subreddit URL: ${locator.url}`);
    }
    return {
      id: parsed.collectionId,
      sourceType: 'reddit',
      canonicalUrl: parsed.canonicalUrl,
      metadata: { subreddit: parsed.subreddit, platform: 'reddit' },
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    assertBoundedLimit(options.limit);
    const subreddit = subredditOf(collection);
    const sort = (options.sort ?? DEFAULT_REDDIT_SORT) as RedditSort;
    const feedUrl = deriveSubredditFeedUrl(
      subreddit,
      sort,
      options.period as RedditPeriod | undefined,
    );
    throw new NotImplementedError(
      `listing Reddit subreddits requires network access (feed: ${feedUrl})`,
    );
  }
}

function subredditOf(collection: ContentCollection): string {
  const subreddit = collection.metadata.subreddit;
  if (typeof subreddit !== 'string' || subreddit === '') {
    throw new ConfigurationError('Reddit collection is missing subreddit metadata');
  }
  return subreddit;
}

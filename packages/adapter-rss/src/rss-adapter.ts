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
import { assertBoundedLimit, ConfigurationError, NotImplementedError } from '@owlieio/core';
import { isFeedUrl, normalizeFeedUrl } from './feed.js';

/**
 * RSS/Atom feed adapter. Recognition and resolution are pure; `list` and
 * `extract` require fetching and parsing and are not implemented in this
 * scaffold.
 */
export class RssAdapter implements CollectionAdapter, ContentExtractor {
  readonly id = 'rss';
  readonly sourceType = 'rss' as const;

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
    throw new NotImplementedError(
      `listing RSS/Atom feeds requires network access (${collection.canonicalUrl})`,
    );
  }

  async extract(_item: ContentItem, _options?: ExtractionOptions): Promise<NormalizedDocument> {
    throw new NotImplementedError('extracting RSS/Atom entries is not implemented yet');
  }
}

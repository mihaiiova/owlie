import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ContentExtractor,
  ExtractionOptions,
  ItemAdapter,
} from '@owlieio/core';
import type {
  ContentCollection,
  ContentItem,
  ContentLocator,
  NormalizedDocument,
  SourceType,
} from '@owlieio/core';
import { assertBoundedLimit } from '@owlieio/core';
import { makeCollection, makeDocument, makeItem } from './fixtures.js';

export interface FakeCollectionAdapterOptions {
  id?: string;
  sourceType?: SourceType;
  items?: ContentItem[];
  recognizedUrl?: string;
}

/** An in-memory collection adapter for tests and contract checks. */
export class FakeCollectionAdapter implements CollectionAdapter {
  readonly id: string;
  readonly sourceType: SourceType;
  private readonly items: ContentItem[];
  private readonly recognizedUrl: string;

  constructor(options: FakeCollectionAdapterOptions = {}) {
    this.id = options.id ?? 'fake-collection';
    this.sourceType = options.sourceType ?? 'rss';
    this.items = options.items ?? [
      makeItem({ id: 'item:a' }),
      makeItem({ id: 'item:b' }),
      makeItem({ id: 'item:c' }),
    ];
    this.recognizedUrl = options.recognizedUrl ?? 'https://example.com/feed.xml';
  }

  recognize(locator: ContentLocator): boolean {
    return locator.url === this.recognizedUrl || locator.hint === this.sourceType;
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    return makeCollection({
      id: `${this.sourceType}:collection:${locator.url}`,
      sourceType: this.sourceType,
      canonicalUrl: locator.url,
    });
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    assertBoundedLimit(options.limit);
    const items = this.items.slice(0, options.limit);
    return { collection, items, truncated: this.items.length > options.limit };
  }
}

export interface FakeItemAdapterOptions {
  id?: string;
  sourceType?: SourceType;
}

/** An in-memory item adapter and content extractor for tests. */
export class FakeItemAdapter implements ItemAdapter, ContentExtractor {
  readonly id: string;
  readonly sourceType: SourceType;

  constructor(options: FakeItemAdapterOptions = {}) {
    this.id = options.id ?? 'fake-item';
    this.sourceType = options.sourceType ?? 'rss';
  }

  recognize(): boolean {
    return true;
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    return makeItem({
      id: `${this.sourceType}:item:${locator.url}`,
      sourceType: this.sourceType,
      canonicalUrl: locator.url,
      title: 'fake title',
    });
  }

  async extract(item: ContentItem, _options?: ExtractionOptions): Promise<NormalizedDocument> {
    return makeDocument({
      id: item.id,
      sourceType: item.sourceType,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      author: item.author,
      text: `extracted: ${item.title ?? item.id}`,
    });
  }
}

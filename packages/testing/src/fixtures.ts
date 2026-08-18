import type { ContentCollection, ContentItem, NormalizedDocument, SourceType } from '@owlieio/core';

export function makeCollection(overrides: Partial<ContentCollection> = {}): ContentCollection {
  return {
    id: 'test:collection:1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/feed.xml',
    metadata: {},
    ...overrides,
  };
}

export function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'test:item:1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/1',
    metadata: {},
    ...overrides,
  };
}

export function makeDocument(overrides: Partial<NormalizedDocument> = {}): NormalizedDocument {
  return {
    schemaVersion: 1,
    id: 'test:document:1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/1',
    mediaType: 'text',
    text: 'hello world',
    metadata: {},
    ...overrides,
  };
}

export function makeSourceType(value: SourceType): SourceType {
  return value;
}

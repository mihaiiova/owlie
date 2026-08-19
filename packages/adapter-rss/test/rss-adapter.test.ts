import { describe, expect, it } from 'vitest';
import { documentFromItem, entryToItem, RssAdapter } from '@owlieio/adapter-rss';
import {
  ConfigurationError,
  ExtractionError,
  type ContentItem,
  type HttpFetcher,
} from '@owlieio/core';
import { collectionAdapterContract } from '@owlieio/testing/contract-tests';
import { RSS20 } from './fixtures.js';

const fakeFetcher: HttpFetcher = {
  fetchText: async () => RSS20,
};

function resolveCollection(adapter = new RssAdapter({ fetcher: fakeFetcher })) {
  return adapter.resolve({ url: 'https://example.com/feed.xml' });
}

describe('entryToItem', () => {
  it('maps an entry to a ContentItem with a stable id and carried text', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const feed = await adapter.list(await resolveCollection(adapter), { limit: 10 });
    const item = feed.items[0]!;

    expect(item.id).toBe('rss:entry:post-1');
    expect(item.sourceType).toBe('rss');
    expect(item.canonicalUrl).toBe('https://example.com/1');
    expect(item.title).toBe('First post');
    expect(item.description).toBe('Summary & teaser');
    expect(item.author).toBe('alice');
    expect(item.publishedAt).toBe('2025-08-19T10:00:00.000Z');
    expect(item.metadata.feedUrl).toBe('https://example.com/feed.xml');
    expect(item.metadata.content).toBe('<p>Full body with <b>markup</b>.</p>');
  });

  it('falls back to the feed URL when an entry has no link', () => {
    const item = entryToItem(
      { id: 'x', title: 'No link', metadata: {} },
      'https://example.com/feed.xml',
    );
    expect(item.canonicalUrl).toBe('https://example.com/feed.xml');
  });
});

describe('documentFromItem', () => {
  it('prefers content over description and strips HTML', () => {
    const item = entryToItem(
      {
        id: 'x',
        title: 'T',
        content: '<p>Body</p>',
        description: '<p>Summary</p>',
        metadata: {},
      },
      'https://example.com/feed.xml',
    );
    const doc = documentFromItem(item);
    expect(doc?.mediaType).toBe('text');
    expect(doc?.text).toBe('Body');
  });

  it('falls back to description when content is absent', () => {
    const item = entryToItem(
      { id: 'x', title: 'T', description: '<p>Summary</p>', metadata: {} },
      'https://example.com/feed.xml',
    );
    expect(documentFromItem(item)?.text).toBe('Summary');
  });

  it('returns null when there is no text', () => {
    const item = entryToItem({ id: 'x', title: 'T', metadata: {} }, 'https://example.com/feed.xml');
    expect(documentFromItem(item)).toBeNull();
  });
});

describe('RssAdapter.list', () => {
  it('lists bounded items and reports truncation', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const collection = await resolveCollection(adapter);
    const result = await adapter.list(collection, { limit: 1 });

    expect(result.collection).toBe(collection);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('rss:entry:post-1');
    expect(result.truncated).toBe(true);
  });

  it('reports no truncation when all entries fit', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const collection = await resolveCollection(adapter);
    const result = await adapter.list(collection, { limit: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('rejects unbounded limits', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const collection = await resolveCollection(adapter);
    await expect(adapter.list(collection, { limit: 0 })).rejects.toThrow(ConfigurationError);
  });
});

describe('RssAdapter.extract', () => {
  it('extracts normalized text from a listed item without re-fetching', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const collection = await resolveCollection(adapter);
    const result = await adapter.list(collection, { limit: 10 });
    const doc = await adapter.extract(result.items[0]!);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.mediaType).toBe('text');
    expect(doc.sourceType).toBe('rss');
    expect(doc.text).toBe('Full body with markup.');
    expect(doc.title).toBe('First post');
    expect(doc.canonicalUrl).toBe('https://example.com/1');
  });

  it('re-fetches the feed when an item carries no text', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const handBuilt: ContentItem = {
      id: 'rss:entry:post-1',
      sourceType: 'rss',
      canonicalUrl: 'https://example.com/1',
      metadata: { entryId: 'post-1', feedUrl: 'https://example.com/feed.xml' },
    };
    const doc = await adapter.extract(handBuilt);
    expect(doc.text).toBe('Full body with markup.');
  });

  it('throws when there is no text and no recoverable feed URL', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcher });
    const bare: ContentItem = {
      id: 'rss:entry:x',
      sourceType: 'rss',
      canonicalUrl: 'https://example.com/x',
      metadata: {},
    };
    await expect(adapter.extract(bare)).rejects.toThrow(ExtractionError);
  });
});

describe('RssAdapter contract', () => {
  collectionAdapterContract('RSS adapter', () => new RssAdapter({ fetcher: fakeFetcher }), {
    url: 'https://example.com/feed.xml',
  });
});

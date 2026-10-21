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
  fetch: async () => ({
    url: 'https://example.com/feed.xml',
    contentType: 'application/rss+xml',
    text: RSS20,
  }),
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

    expect(result.collection).toEqual({
      ...collection,
      title: 'Example Channel',
      metadata: {
        format: 'rss',
        description: 'A sample feed',
        siteUrl: 'https://example.com/',
        imageUrl: 'https://example.com/logo.png',
      },
    });
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

    expect(doc.schemaVersion).toBe(2);
    expect(doc.mediaType).toBe('text');
    expect(doc.sourceType).toBe('rss');
    expect(doc.text).toBe('Full body with markup.');
    expect(doc.title).toBe('First post');
    expect(doc.canonicalUrl).toBe('https://example.com/1');
    expect(doc.provenance).toMatchObject({
      sourceId: doc.id,
      canonicalUrl: 'https://example.com/1',
      adapterId: 'rss',
    });
    expect(doc.provenance.contentFingerprint.digest).toHaveLength(64);
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

describe('RssAdapter feed media-type gate', () => {
  const htmlFetcher: HttpFetcher = {
    fetch: async () => ({
      url: 'https://example.com/feed.xml',
      contentType: 'text/html',
      text: RSS20,
    }),
  };
  const noTypeFetcher: HttpFetcher = {
    fetch: async () => ({
      url: 'https://example.com/feed.xml',
      contentType: null,
      text: RSS20,
    }),
  };

  it('rejects a declared non-feed content type before parsing', async () => {
    const adapter = new RssAdapter({ fetcher: htmlFetcher });
    const collection = await resolveCollection(adapter);
    await expect(adapter.list(collection, { limit: 10 })).rejects.toThrow(ExtractionError);
  });

  it('rejects a declared non-feed content type during extract re-fetch', async () => {
    const adapter = new RssAdapter({ fetcher: htmlFetcher });
    const bare: ContentItem = {
      id: 'rss:entry:post-1',
      sourceType: 'rss',
      canonicalUrl: 'https://example.com/1',
      metadata: { entryId: 'post-1', feedUrl: 'https://example.com/feed.xml' },
    };
    await expect(adapter.extract(bare)).rejects.toThrow(ExtractionError);
  });

  it('accepts a feed without a declared content type (documented compatibility case)', async () => {
    const adapter = new RssAdapter({ fetcher: noTypeFetcher });
    const collection = await resolveCollection(adapter);
    const result = await adapter.list(collection, { limit: 10 });
    expect(result.items).toHaveLength(2);
  });

  it('accepts an empty or whitespace-only declared content type (compat preserved)', async () => {
    for (const contentType of ['', '   ']) {
      const fetcher: HttpFetcher = {
        fetch: async () => ({
          url: 'https://example.com/feed.xml',
          contentType,
          text: RSS20,
        }),
      };
      const adapter = new RssAdapter({ fetcher });
      const collection = await resolveCollection(adapter);
      const result = await adapter.list(collection, { limit: 10 });
      expect(result.items).toHaveLength(2);
    }
  });
});

describe('RssAdapter.list ordering and partial reads', () => {
  const FEED_URL = 'https://example.com/feed.xml';

  function feedOf(items: string[]): string {
    return `<?xml version="1.0"?><rss version="2.0"><channel><title>Show</title>${items.join('')}</channel></rss>`;
  }

  function entry(id: string, pubDate?: string, title = id): string {
    return `<item><title>${title}</title><link>https://example.com/${id}</link><guid>${id}</guid>${
      pubDate ? `<pubDate>${pubDate}</pubDate>` : ''
    }</item>`;
  }

  /** Streams `text` in chunks and honours `stopReading`, like DefaultHttpFetcher. */
  function streamingFetcher(text: string, chunk = 40) {
    const calls: Array<{ stopped: boolean; delivered: number; streamed: boolean }> = [];
    const fetcher: HttpFetcher = {
      async fetch(url, options) {
        let delivered = text.length;
        let stopped = false;
        if (options?.stopReading) {
          for (let end = chunk; ; end += chunk) {
            delivered = Math.min(end, text.length);
            if (options.stopReading(text.slice(0, delivered), 'application/rss+xml')) {
              stopped = delivered < text.length;
              break;
            }
            if (delivered === text.length) break;
          }
        }
        calls.push({ stopped, delivered, streamed: options?.stopReading !== undefined });
        return {
          url,
          contentType: 'application/rss+xml',
          text: text.slice(0, delivered),
          ...(stopped ? { partial: true } : {}),
        };
      },
    };
    return { fetcher, calls };
  }

  const many = feedOf(
    Array.from({ length: 50 }, (_, i) => entry(`e${i + 1}`, 'Tue, 19 Aug 2025 10:00:00 GMT')),
  );

  it('stops reading after the entry following the limit, with the same items as a full read', async () => {
    const full = await new RssAdapter({ fetcher: fakeFetcherFor(many) }).list(
      await new RssAdapter({ fetcher: fakeFetcherFor(many) }).resolve({ url: FEED_URL }),
      { limit: 3 },
    );
    const { fetcher, calls } = streamingFetcher(many);
    const adapter = new RssAdapter({ fetcher });
    const result = await adapter.list(await adapter.resolve({ url: FEED_URL }), { limit: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.stopped).toBe(true);
    expect(calls[0]!.delivered).toBeLessThan(many.length / 4);
    expect(result).toEqual(full);
    expect(result.items.map((item) => item.title)).toEqual(['e1', 'e2', 'e3']);
    expect(result.truncated).toBe(true);
    expect(result.collection.title).toBe('Show');
  });

  it('reads the whole feed when an entry in the prefix is dropped', async () => {
    const feed = feedOf([entry('e1'), '<item></item>', entry('e3'), entry('e4')]);
    const { fetcher, calls } = streamingFetcher(feed, 10);
    const adapter = new RssAdapter({ fetcher });
    const result = await adapter.list(await adapter.resolve({ url: FEED_URL }), { limit: 2 });
    const fullItems = (
      await new RssAdapter({ fetcher: fakeFetcherFor(feed) }).list(
        await adapter.resolve({ url: FEED_URL }),
        { limit: 2 },
      )
    ).items;
    expect(result.items).toEqual(fullItems);
    expect(result.items).toHaveLength(2);
    expect(calls.at(-1)!.streamed).toBe(false);
  });

  it('fetches once when the feed has no more entries than the limit', async () => {
    const feed = feedOf([entry('e1'), entry('e2')]);
    const { fetcher, calls } = streamingFetcher(feed);
    const adapter = new RssAdapter({ fetcher });
    const result = await adapter.list(await adapter.resolve({ url: FEED_URL }), { limit: 5 });
    expect(calls).toHaveLength(1);
    expect(result.items).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('is not truncated when the feed has exactly the limit', async () => {
    const feed = feedOf([entry('e1'), entry('e2')]);
    const { fetcher } = streamingFetcher(feed);
    const adapter = new RssAdapter({ fetcher });
    const result = await adapter.list(await adapter.resolve({ url: FEED_URL }), { limit: 2 });
    expect(result.truncated).toBe(false);
  });

  it('sorts by publication date with sort "newest", undated entries last in feed order', async () => {
    const feed = feedOf([
      entry('old', 'Mon, 01 Jan 2024 00:00:00 GMT'),
      entry('undated-a'),
      entry('new', 'Mon, 01 Sep 2025 00:00:00 GMT'),
      entry('undated-b'),
      entry('mid', 'Mon, 01 Jan 2025 00:00:00 GMT'),
    ]);
    const { fetcher, calls } = streamingFetcher(feed);
    const adapter = new RssAdapter({ fetcher });
    const collection = await adapter.resolve({ url: FEED_URL });
    const result = await adapter.list(collection, { limit: 10, sort: 'newest' });
    expect(result.items.map((item) => item.title)).toEqual([
      'new',
      'mid',
      'old',
      'undated-a',
      'undated-b',
    ]);
    expect(calls[0]!.streamed).toBe(false);

    const top = await adapter.list(collection, { limit: 2, sort: 'newest' });
    expect(top.items.map((item) => item.title)).toEqual(['new', 'mid']);
    expect(top.truncated).toBe(true);
  });

  it('keeps feed order for sort "feed" and rejects an unknown sort', async () => {
    const adapter = new RssAdapter({ fetcher: fakeFetcherFor(many) });
    const collection = await adapter.resolve({ url: FEED_URL });
    const result = await adapter.list(collection, { limit: 2, sort: 'feed' });
    expect(result.items.map((item) => item.title)).toEqual(['e1', 'e2']);
    await expect(adapter.list(collection, { limit: 2, sort: 'oldest' })).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });
});

function fakeFetcherFor(text: string): HttpFetcher {
  return {
    fetch: async (url) => ({ url, contentType: 'application/rss+xml', text }),
  };
}

import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  CollectionListOptions,
  ContentCollection,
  ContentItem,
  ItemAdapter,
} from '@owlieio/core';
import { ConfigurationError, extractItem, listCollection, resolveItem } from '@owlieio/core';

function collection(locatorUrl: string): ContentCollection {
  return {
    id: 'test:collection',
    sourceType: 'rss',
    canonicalUrl: locatorUrl,
    metadata: {},
  };
}

function item(id: string): ContentItem {
  return { id, sourceType: 'rss', canonicalUrl: `https://example.com/${id}`, metadata: {} };
}

const collectionAdapter: CollectionAdapter = {
  id: 'fake',
  sourceType: 'rss',
  recognize: () => true,
  resolve: async (locator) => collection(locator.url),
  list: async (c, options: CollectionListOptions) => ({
    collection: c,
    items: [item('1'), item('2')].slice(0, options.limit),
    truncated: false,
  }),
};

const itemAdapter: ItemAdapter = {
  id: 'fake-item',
  sourceType: 'rss',
  recognize: () => true,
  resolveItem: async (locator) => item(locator.url.split('/').pop() ?? '1'),
  extract: async (i) => ({
    schemaVersion: 1,
    id: i.id,
    sourceType: 'rss',
    canonicalUrl: i.canonicalUrl,
    mediaType: 'text',
    text: 'hello',
    metadata: {},
  }),
};

describe('orchestration', () => {
  it('lists a bounded collection through an adapter', async () => {
    const result = await listCollection(
      collectionAdapter,
      { url: 'https://example.com/feed' },
      { limit: 1 },
    );
    expect(result.collection.canonicalUrl).toBe('https://example.com/feed');
    expect(result.items).toHaveLength(1);
  });

  it('resolves and extracts an item', async () => {
    const resolved = await resolveItem(itemAdapter, { url: 'https://example.com/42' });
    expect(resolved.id).toBe('42');
    const doc = await extractItem(itemAdapter, resolved);
    expect(doc.text).toBe('hello');
  });

  it('rejects item resolution when the adapter cannot resolve', async () => {
    const noResolve: ItemAdapter = {
      id: 'x',
      sourceType: 'rss',
      recognize: () => true,
      extract: itemAdapter.extract,
    };
    await expect(resolveItem(noResolve, { url: 'https://example.com/1' })).rejects.toThrow(
      ConfigurationError,
    );
  });

  it('honors cancellation before extraction', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractItem(itemAdapter, item('1'), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

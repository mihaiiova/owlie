import { describe, expect, it } from 'vitest';
import { CancelledError, ConfigurationError, ExtractionError } from '@owlieio/core';
import { FakeProgressSink, FIXTURE_FETCHED_AT } from '@owlieio/testing';
import { collectionAdapterContract, itemAdapterContract } from '@owlieio/testing/contract-tests';
import { HackerNewsAdapter, resolveCommentBounds } from '../src/index.js';
import { API, fakeApi } from './fixtures.js';

const ITEM_URL = 'https://news.ycombinator.com/item?id=100';

function adapter(options: ConstructorParameters<typeof HackerNewsAdapter>[0] = {}) {
  const api = fakeApi();
  return { adapter: new HackerNewsAdapter({ fetcher: api.fetcher, ...options }), calls: api.calls };
}

collectionAdapterContract('HackerNewsAdapter', () => adapter().adapter, {
  url: 'https://news.ycombinator.com/',
});
itemAdapterContract('HackerNewsAdapter', () => adapter().adapter, { url: ITEM_URL });

describe('HackerNewsAdapter.resolve', () => {
  it('resolves lists and user submissions with titles', async () => {
    const { adapter: hn } = adapter();
    await expect(hn.resolve({ url: 'https://news.ycombinator.com/ask' })).resolves.toEqual({
      id: 'hackernews:list:ask',
      sourceType: 'hackernews',
      canonicalUrl: 'https://news.ycombinator.com/ask',
      title: 'Hacker News: Ask HN',
      metadata: { platform: 'hackernews', list: 'ask' },
    });
    await expect(
      hn.resolve({ url: 'https://news.ycombinator.com/submitted?id=alice' }),
    ).resolves.toMatchObject({
      id: 'hackernews:user:alice',
      title: "Hacker News: alice's submissions",
      metadata: { user: 'alice' },
    });
  });

  it('rejects an item URL as a collection', async () => {
    await expect(adapter().adapter.resolve({ url: ITEM_URL })).rejects.toThrow(
      /hackernews:item:100 is an item/,
    );
  });
});

describe('HackerNewsAdapter.list', () => {
  it('lists usable stories in list order with HN metadata', async () => {
    const { adapter: hn } = adapter();
    const collection = await hn.resolve({ url: 'https://news.ycombinator.com/' });
    const result = await hn.list(collection, { limit: 10 });
    expect(result.items.map((item) => item.id)).toEqual([
      'hackernews:item:100',
      'hackernews:item:105',
      'hackernews:item:106',
      'hackernews:item:101',
    ]);
    expect(result.truncated).toBe(false);
    expect(result.items[0]).toEqual({
      id: 'hackernews:item:100',
      sourceType: 'hackernews',
      canonicalUrl: 'https://news.ycombinator.com/item?id=100',
      title: 'A useful tool',
      publishedAt: new Date(1_760_000_000 * 1000).toISOString(),
      author: 'alice',
      metadata: {
        hnId: 100,
        kind: 'story',
        platform: 'hackernews',
        score: 120,
        commentCount: 6,
        linkUrl: 'https://example.com/tool',
      },
    });
  });

  it('detects kinds and drops an unsafe link', async () => {
    const { adapter: hn } = adapter();
    const collection = await hn.resolve({ url: 'https://news.ycombinator.com/' });
    const { items } = await hn.list(collection, { limit: 10 });
    const byId = Object.fromEntries(items.map((item) => [item.metadata.hnId, item.metadata]));
    expect(byId[105]).toMatchObject({ kind: 'job' });
    expect(byId[105]).not.toHaveProperty('linkUrl');
    expect(byId[106]).toMatchObject({ kind: 'show' });
    expect(byId[101]).toMatchObject({ kind: 'ask' });
  });

  it('stops at the limit and reports truncation', async () => {
    const { adapter: hn, calls } = adapter();
    const collection = await hn.resolve({ url: 'https://news.ycombinator.com/' });
    const result = await hn.list(collection, { limit: 1 });
    expect(result.items.map((item) => item.id)).toEqual(['hackernews:item:100']);
    expect(result.truncated).toBe(true);
    // The id list plus at most one fetch batch.
    expect(calls.filter((url) => url.includes('/item/')).length).toBeLessThanOrEqual(5);
  });

  it('marks Ask HN items from the ask list', async () => {
    const { adapter: hn } = adapter();
    const collection = await hn.resolve({ url: 'https://news.ycombinator.com/ask' });
    const { items } = await hn.list(collection, { limit: 5 });
    expect(items.map((item) => item.metadata.kind)).toEqual(['ask']);
  });

  it('filters a user submissions mix and caps item fetches', async () => {
    const { adapter: hn, calls } = adapter();
    const collection = await hn.resolve({
      url: 'https://news.ycombinator.com/submitted?id=alice',
    });
    const result = await hn.list(collection, { limit: 2 });
    // Six comments come first; the cap (2 × 3 = 6 fetches) is reached before the story.
    expect(result.items).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.collection.metadata.fetchCapReached).toBe(true);
    expect(calls.filter((url) => url.includes('/item/')).length).toBe(6);

    const wider = await hn.list(collection, { limit: 3 });
    expect(wider.items.map((item) => item.id)).toEqual(['hackernews:item:100']);
    expect(wider.collection.metadata).not.toHaveProperty('fetchCapReached');
  });

  it('fails clearly for an unknown user', async () => {
    const { adapter: hn } = adapter();
    const collection = await hn.resolve({
      url: 'https://news.ycombinator.com/submitted?id=nobody',
    });
    await expect(hn.list(collection, { limit: 1 })).rejects.toThrow(
      'Hacker News user not found: nobody',
    );
  });

  it('rejects a non-JSON API response', async () => {
    const api = fakeApi({
      [`${API}/topstories.json`]: { contentType: 'text/html', text: '<html></html>' },
    });
    const hn = new HackerNewsAdapter({ fetcher: api.fetcher });
    const collection = await hn.resolve({ url: 'https://news.ycombinator.com/' });
    await expect(hn.list(collection, { limit: 1 })).rejects.toThrow(/expected JSON/);
  });

  it('rejects a malformed id list', async () => {
    const api = fakeApi({
      [`${API}/topstories.json`]: { contentType: 'application/json', text: '{"a":1}' },
    });
    const hn = new HackerNewsAdapter({ fetcher: api.fetcher });
    const collection = await hn.resolve({ url: 'https://news.ycombinator.com/' });
    await expect(hn.list(collection, { limit: 1 })).rejects.toThrow(ExtractionError);
  });
});

describe('HackerNewsAdapter.resolveItem', () => {
  it('resolves an item without network', async () => {
    const { adapter: hn, calls } = adapter();
    await expect(hn.resolveItem({ url: ITEM_URL })).resolves.toEqual({
      id: 'hackernews:item:100',
      sourceType: 'hackernews',
      canonicalUrl: ITEM_URL,
      metadata: { hnId: 100, platform: 'hackernews' },
    });
    expect(calls).toEqual([]);
  });

  it('rejects a list URL as an item', async () => {
    await expect(
      adapter().adapter.resolveItem({ url: 'https://news.ycombinator.com/' }),
    ).rejects.toThrow(ConfigurationError);
  });
});

describe('HackerNewsAdapter.extract', () => {
  it('extracts the discussion with the default bounds (depth 2)', async () => {
    const { adapter: hn } = adapter();
    const item = await hn.resolveItem({ url: ITEM_URL });
    const progress = new FakeProgressSink();
    const document = await hn.extract(item, { progress, fetchedAt: FIXTURE_FETCHED_AT });
    expect(document.text).toBe(
      [
        'A useful tool',
        'Link: https://example.com/tool',
        'Hacker News: https://news.ycombinator.com/item?id=100',
        `by alice · 120 points · 6 comments · ${new Date(1_760_000_000 * 1000).toISOString()}`,
        '',
        'Comments:',
        '',
        '[c1]',
        '  First top comment.',
        '',
        '  Code:',
        '',
        '    a < b',
        '    b > c',
        '',
        '    [r1]',
        '      Reply one',
        '',
        '[c3]',
        '  Third comment',
        '',
        '    [r3]',
        '      Reply three',
      ].join('\n'),
    );
    expect(document).toMatchObject({
      id: 'hackernews:item:100',
      sourceType: 'hackernews',
      canonicalUrl: ITEM_URL,
      mediaType: 'text',
      title: 'A useful tool',
      author: 'alice',
      metadata: {
        hnId: 100,
        kind: 'story',
        linkUrl: 'https://example.com/tool',
        hnContent: 'discussion',
        commentsIncluded: 4,
        commentsOmitted: 2,
      },
      provenance: {
        sourceId: 'hackernews:item:100',
        adapterId: 'hackernews',
        fetchedAt: FIXTURE_FETCHED_AT,
        warnings: [{ code: 'HN_COMMENTS_TRUNCATED' }],
      },
    });
    expect(progress.events.map((event) => event.type)).toEqual(['started', 'completed']);
  });

  it('reads deeper replies when the depth allows', async () => {
    const { adapter: hn } = adapter({ comments: { depth: 3 } });
    const document = await hn.extract(await hn.resolveItem({ url: ITEM_URL }));
    expect(document.text).toContain('        [d1]\n          Deep reply');
    expect(document.metadata.commentsIncluded).toBe(5);
  });

  it('bounds top-level and total comments', async () => {
    const top = adapter({ comments: { maxTopLevelComments: 1, depth: 1 } }).adapter;
    const onlyFirst = await top.extract(await top.resolveItem({ url: ITEM_URL }));
    expect(onlyFirst.metadata.commentsIncluded).toBe(1);
    expect(onlyFirst.text).not.toContain('[c3]');

    const total = adapter({ comments: { maxComments: 2 } }).adapter;
    const capped = await total.extract(await total.resolveItem({ url: ITEM_URL }));
    // Top-level slots go first (the deleted comment uses one), then replies.
    expect(capped.metadata.commentsIncluded).toBe(2);
    expect(capped.text).toContain('[r1]');
    expect(capped.text).not.toContain('[c3]');
  });

  it('extracts a text post with its own text and no warning', async () => {
    const { adapter: hn } = adapter();
    const document = await hn.extract(
      await hn.resolveItem({ url: 'https://news.ycombinator.com/item?id=101' }),
    );
    expect(document.text).toContain("I'm curious.\n\nSee https://example.com/notes");
    expect(document.metadata).toMatchObject({ kind: 'ask', commentsIncluded: 0 });
    expect(document.metadata).not.toHaveProperty('linkUrl');
    expect(document.provenance.warnings).toEqual([]);
  });

  it.each([
    [104, 'Hacker News item 104 is a comment, not a story'],
    [102, 'Hacker News item 102 is deleted'],
    [103, 'Hacker News item 103 is dead'],
    [999, 'Hacker News item 999 does not exist'],
  ])('fails clearly for item %i', async (id, message) => {
    const { adapter: hn } = adapter();
    const progress = new FakeProgressSink();
    const item = await hn.resolveItem({ url: `https://news.ycombinator.com/item?id=${id}` });
    await expect(hn.extract(item, { progress })).rejects.toThrow(message);
    expect(progress.events.map((event) => event.type)).toEqual(['started', 'failed']);
  });

  it('honours cancellation', async () => {
    const { adapter: hn } = adapter();
    const controller = new AbortController();
    controller.abort();
    const progress = new FakeProgressSink();
    const item = await hn.resolveItem({ url: ITEM_URL });
    await expect(hn.extract(item, { signal: controller.signal, progress })).rejects.toThrow(
      CancelledError,
    );
    expect(progress.events.map((event) => event.type)).toEqual(['started', 'cancelled']);
  });
});

describe('resolveCommentBounds', () => {
  it('defaults to 30 top-level comments, depth 2, and 100 in total', () => {
    expect(resolveCommentBounds()).toEqual({ maxTopLevelComments: 30, depth: 2, maxComments: 100 });
  });

  it.each([
    [{ depth: 4 }],
    [{ depth: 0 }],
    [{ maxComments: 301 }],
    [{ maxTopLevelComments: 101 }],
    [{ maxComments: 1.5 }],
  ])('rejects %o', (bounds) => {
    expect(() => resolveCommentBounds(bounds)).toThrow(ConfigurationError);
  });
});

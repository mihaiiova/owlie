import { describe, expect, it } from 'vitest';
import type { ContentItem, HttpFetcher, ItemAdapter, NormalizedDocument } from '@owlieio/core';
import { buildProvenance } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const SHOW_URL = 'https://podcasts.apple.com/us/podcast/unexplainable/id1554578197';
const LOOKUP_URL = 'https://itunes.apple.com/lookup?id=1554578197&country=us';
const FEED_URL = 'https://feeds.megaphone.fm/VMP9331026707';
const APPLE = {
  podcastId: '1554578197',
  showUrl: 'https://podcasts.apple.com/us/podcast/id1554578197',
};

/** Sanitized podcast RSS fixture (no network content). */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Unexplainable</title>
  <link>https://example.com/unexplainable</link>
  <item>
    <title>Episode two</title>
    <link>https://example.com/episodes/2</link>
    <guid isPermaLink="false">ep-2</guid>
    <enclosure url="https://cdn.example.com/2.mp3" type="audio/mpeg" length="1"/>
  </item>
  <item>
    <title>Episode one</title>
    <link>https://example.com/episodes/1</link>
    <guid isPermaLink="false">ep-1</guid>
    <enclosure url="https://cdn.example.com/1.mp3" type="audio/mpeg" length="1"/>
  </item>
</channel></rss>`;

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

function fetcherFor(
  lookupBody: string = JSON.stringify({
    resultCount: 1,
    results: [{ kind: 'podcast', collectionName: 'Unexplainable', feedUrl: FEED_URL }],
  }),
): HttpFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetch(url) {
      calls.push(url);
      if (url === LOOKUP_URL) return { url, contentType: 'text/javascript', text: lookupBody };
      if (url === FEED_URL) return { url, contentType: 'application/rss+xml', text: FEED };
      throw new Error(`unexpected URL: ${url}`);
    },
  };
}

function network(fetcher: HttpFetcher) {
  return {
    env: {},
    loadFile: () => ({}),
    readConfig: () => ({}),
    createFetcher: () => fetcher,
  };
}

function articleAdapter(): ItemAdapter & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    id: 'article',
    sourceType: 'article',
    recognize: () => true,
    async resolveItem(locator) {
      urls.push(locator.url);
      return {
        id: `article:${locator.url}`,
        sourceType: 'article',
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
    async extract(item: ContentItem) {
      const text = `text of ${item.canonicalUrl}`;
      const document: NormalizedDocument = {
        schemaVersion: 2,
        id: item.id,
        sourceType: item.sourceType,
        canonicalUrl: item.canonicalUrl,
        mediaType: 'text',
        text,
        metadata: {},
        provenance: buildProvenance({
          sourceId: item.id,
          canonicalUrl: item.canonicalUrl,
          adapterId: 'article',
          text,
          fetchedAt: '2026-10-21T00:00:00.000Z',
        }),
      };
      return document;
    },
  };
}

describe('Apple Podcasts show URLs', () => {
  it("list: lists the show's feed exactly as the feed URL, plus metadata.apple", async () => {
    const viaShow = capture();
    const showFetcher = fetcherFor();
    const showDeps: CliDeps = { list: { network: network(showFetcher) } };
    expect(await run(['list', SHOW_URL, '--json'], viaShow.io, showDeps)).toBe(ExitCode.Success);

    const viaFeed = capture();
    const feedDeps: CliDeps = { list: { network: network(fetcherFor()) } };
    expect(await run(['list', FEED_URL, '--json'], viaFeed.io, feedDeps)).toBe(ExitCode.Success);

    const show = JSON.parse(viaShow.stdout()).result;
    const feed = JSON.parse(viaFeed.stdout()).result;
    expect(showFetcher.calls).toEqual([LOOKUP_URL, FEED_URL]);
    expect(show.collection.id).toBe(feed.collection.id);
    expect(show.collection.canonicalUrl).toBe(FEED_URL);
    expect(show.collection.metadata).toEqual({ ...feed.collection.metadata, apple: APPLE });
    expect(show.items).toEqual(feed.items);
    expect(show.items.map((item: { title: string }) => item.title)).toEqual([
      'Episode two',
      'Episode one',
    ]);
  });

  it('list: honours --limit on the resolved feed', async () => {
    const { io, stdout } = capture();
    const deps: CliDeps = { list: { network: network(fetcherFor()) } };
    expect(await run(['list', SHOW_URL, '--json', '--limit', '1'], io, deps)).toBe(
      ExitCode.Success,
    );
    const result = JSON.parse(stdout()).result;
    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('list: a show with no public feed is an EXTRACTION_ERROR record', async () => {
    const { io, stderr } = capture();
    const deps: CliDeps = {
      list: { network: network(fetcherFor(JSON.stringify({ results: [{ kind: 'podcast' }] }))) },
    };
    expect(await run(['list', SHOW_URL, '--json'], io, deps)).toBe(ExitCode.Error);
    expect(JSON.parse(stderr().trim())).toMatchObject({
      command: 'list',
      kind: 'error',
      code: 'EXTRACTION_ERROR',
      message: 'Apple Podcasts show 1554578197 has no public RSS feed',
    });
  });

  it("extract: extracts the show's feed entries with metadata.apple on the collection", async () => {
    const { io, stdout } = capture();
    const article = articleAdapter();
    const deps: CliDeps = {
      extract: { itemAdapters: [article], network: network(fetcherFor()) },
    };
    expect(await run(['extract', SHOW_URL, '--json', '--limit', '1'], io, deps)).toBe(
      ExitCode.Success,
    );
    const result = JSON.parse(stdout()).result;
    expect(result.collection.canonicalUrl).toBe(FEED_URL);
    expect(result.collection.metadata.apple).toEqual(APPLE);
    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(article.urls).toEqual(['https://example.com/episodes/2']);
  });

  it('extract --feed: also resolves the show feed', async () => {
    const { io, stdout } = capture();
    const deps: CliDeps = {
      extract: { itemAdapters: [articleAdapter()], network: network(fetcherFor()) },
    };
    expect(await run(['extract', SHOW_URL, '--feed', '--json'], io, deps)).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.collection.metadata.apple).toEqual(APPLE);
  });

  it('extract --article: rejects a show URL as a usage error without fetching', async () => {
    const { io, stderr } = capture();
    const fetcher = fetcherFor();
    const deps: CliDeps = {
      extract: { itemAdapters: [articleAdapter()], network: network(fetcher) },
    };
    expect(await run(['extract', SHOW_URL, '--article', '--json'], io, deps)).toBe(ExitCode.Usage);
    expect(stderr()).toContain('--article cannot be used with an Apple Podcasts show URL');
    expect(fetcher.calls).toEqual([]);
  });
});

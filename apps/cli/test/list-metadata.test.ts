import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { ExtractionError, JSON_PROTOCOL_SCHEMA_VERSION } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { RssAdapter } from '@owlieio/adapter-rss';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const FEED_URL = 'https://example.com/feed.xml';
const POST_URL = 'https://example.com/posts/1';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Example &amp; Co</title>
  <link>https://example.com/</link>
  <description>News from Example</description>
  <image><url>https://example.com/logo.png</url></image>
  <item>
    <title>Episode one</title>
    <link>${POST_URL}</link>
    <guid>ep-1</guid>
    <pubDate>Tue, 19 Aug 2025 10:00:00 GMT</pubDate>
    <content:encoded><![CDATA[<p>Rich <b>HTML</b> body</p>]]></content:encoded>
    <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="1000"/>
    <media:content url="https://example.com/ep1.jpg" type="image/jpeg" medium="image"/>
  </item>
  <item>
    <title>No guid</title>
    <link>https://example.com/posts/2</link>
  </item>
</channel>
</rss>`;

const ARTICLE = `<!doctype html><html><head><meta property="og:type" content="article"><title>Post</title></head>
<body><article><h1>Post</h1><p>${'A readable paragraph of article prose for the feed batch test. '.repeat(6)}</p></article></body></html>`;

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: true, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

function fetcher(pages: Record<string, HttpTextResponse>): HttpFetcher {
  return {
    async fetch(url) {
      const page = pages[url];
      if (!page) throw new ExtractionError(`unexpected fetch: ${url}`);
      return page;
    },
  };
}

const feedPages = {
  [FEED_URL]: { url: FEED_URL, contentType: 'application/rss+xml', text: FEED },
  [POST_URL]: { url: POST_URL, contentType: 'text/html', text: ARTICLE },
};

describe('list --json — feed metadata, typed enclosures, entry id source', () => {
  it('returns feed metadata on the collection', async () => {
    const { io, stdout } = capture();
    const code = await run(['list', FEED_URL, '--json'], io, {
      list: { adapter: new RssAdapter({ fetcher: fetcher(feedPages) }) },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.result.collection).toMatchObject({
      canonicalUrl: FEED_URL,
      title: 'Example & Co',
      metadata: {
        format: 'rss',
        description: 'News from Example',
        siteUrl: 'https://example.com/',
        imageUrl: 'https://example.com/logo.png',
      },
    });
  });

  it('returns entry id source, typed enclosures and media, without HTML', async () => {
    const { io, stdout } = capture();
    await run(['list', FEED_URL, '--json'], io, {
      list: { adapter: new RssAdapter({ fetcher: fetcher(feedPages) }) },
    });
    const [first, second] = JSON.parse(stdout()).result.items;
    expect(first).toMatchObject({
      id: 'rss:entry:ep-1',
      canonicalUrl: POST_URL,
      publishedAt: '2025-08-19T10:00:00.000Z',
      metadata: {
        entryId: 'ep-1',
        entryIdSource: 'guid',
        enclosures: [{ url: 'https://example.com/ep1.mp3', type: 'audio/mpeg', length: 1000 }],
        media: [{ url: 'https://example.com/ep1.jpg', type: 'image/jpeg', medium: 'image' }],
        enclosureUrl: 'https://example.com/ep1.mp3',
      },
    });
    expect(second.metadata).toMatchObject({
      entryId: 'https://example.com/posts/2',
      entryIdSource: 'link',
    });
    expect(stdout()).not.toContain('<b>HTML</b>');
    expect(first.metadata.content).toBeUndefined();
    expect(first.metadata.feedUrl).toBeUndefined();
  });

  it('carries entry metadata into feed-batch documents', async () => {
    const shared = fetcher(feedPages);
    const { io, stdout } = capture();
    await run(['extract', FEED_URL, '--limit', '1'], io, {
      extract: {
        itemAdapters: [new ArticleAdapter({ fetcher: shared })],
        feedAdapter: new RssAdapter({ fetcher: shared }),
      },
    });
    const item = JSON.parse(stdout()).result.items[0];
    expect(item.document.metadata.feedEntry).toMatchObject({
      entryId: 'ep-1',
      entryIdSource: 'guid',
      enclosures: [{ url: 'https://example.com/ep1.mp3', type: 'audio/mpeg', length: 1000 }],
    });
    expect(item.document.sourceType).toBe('article');
  });
});

import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { RssAdapter } from '@owlieio/adapter-rss';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const PAGE_URL = 'https://example.com/';
const FEED_URL = 'https://example.com/atom/everything/';
const ENTRY_URL = 'https://example.com/2026/Sep/30/post/';

const PAGE = `<!doctype html><html><head><title>Example</title>
<meta property="og:type" content="website">
<link rel="alternate" type="application/atom+xml" href="/atom/everything/">
</head><body><nav>Home</nav></body></html>`;

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
<entry><id>post-1</id><title>Post</title><link href="${ENTRY_URL}"/></entry></feed>`;

const ARTICLE = `<!doctype html><html><head><meta property="og:type" content="article"><title>Post</title></head>
<body><article><h1>Post</h1><p>${'A readable paragraph of article prose for the discovery test. '.repeat(6)}</p></article></body></html>`;

const pages: Record<string, HttpTextResponse> = {
  [PAGE_URL]: { url: PAGE_URL, contentType: 'text/html', text: PAGE },
  [FEED_URL]: { url: FEED_URL, contentType: 'application/atom+xml', text: FEED },
  [ENTRY_URL]: { url: ENTRY_URL, contentType: 'text/html', text: ARTICLE },
};

const fetcher: HttpFetcher = {
  async fetch(url) {
    const page = pages[url];
    if (!page) throw new ExtractionError(`unexpected fetch: ${url}`);
    return page;
  },
};

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

describe('feeds at non-feed-shaped URLs (#119)', () => {
  it.each([
    ['a page that declares the feed', PAGE_URL],
    ['the feed URL itself', FEED_URL],
  ])('list works from %s', async (_label, url) => {
    const { io, stdout, stderr } = capture();
    const code = await run(['list', url, '--json'], io, {
      list: { adapter: new RssAdapter({ fetcher }) },
    });
    expect(stderr()).not.toContain('not a recognized RSS/Atom feed URL');
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection.canonicalUrl).toBe(FEED_URL);
    expect(envelope.items.map((item: { canonicalUrl: string }) => item.canonicalUrl)).toEqual([
      ENTRY_URL,
    ]);
  });

  it.each([
    ['a non-article page', PAGE_URL, []],
    ['--feed on a page', PAGE_URL, ['--feed']],
    ['the feed URL itself', FEED_URL, []],
  ])('extract batches the feed from %s', async (_label, url, flags) => {
    const { io, stdout } = capture();
    const code = await run(['extract', url, ...flags], io, {
      extract: {
        itemAdapters: [new ArticleAdapter({ fetcher })],
        feedAdapter: new RssAdapter({ fetcher }),
      },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection.canonicalUrl).toBe(FEED_URL);
    expect(envelope.items[0]).toMatchObject({
      url: ENTRY_URL,
      document: { sourceType: 'article' },
    });
  });
});

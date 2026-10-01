import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse, ItemAdapter } from '@owlieio/core';
import { ExtractionError, NotHandledError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { RssAdapter } from '@owlieio/adapter-rss';
import { ExitCode, extractWithFallback, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const ARTICLE_URL = 'https://example.com/posts/story';
const PAGE_URL = 'https://example.com/';
const FEED_URL = 'https://example.com/feed.xml';
const ENTRY_URL = 'https://example.com/posts/entry';

const PARAGRAPHS = `<p>${'This paragraph is part of a static article with complete sentences, concrete detail, and enough words to read as editorial prose. '.repeat(3)}</p>
<p>${'A second paragraph adds context and a conclusion, so the extractor has a clear readable body to return for the reader. '.repeat(3)}</p>`;

const OG_ARTICLE = `<!doctype html><html><head><title>Declared story</title>
<meta property="og:type" content="article">
<link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><main><article><h1>Declared story</h1>${PARAGRAPHS}</article></main></body></html>`;

const JSON_LD_ARTICLE = `<!doctype html><html><head><title>Graph story</title>
<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"BlogPosting"}]}</script>
<link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><main><article><h1>Graph story</h1>${PARAGRAPHS}</article></main></body></html>`;

const UNDECLARED_ARTICLE = `<!doctype html><html><head><title>Undeclared story</title>
<link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><main><article><h1>Undeclared story</h1>${PARAGRAPHS}</article></main></body></html>`;

const HOMEPAGE = `<!doctype html><html><head><title>Example</title>
<meta property="og:type" content="website">
<link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><main>${PARAGRAPHS}</main></body></html>`;

const BARE_PAGE = `<!doctype html><html><head><meta property="og:type" content="website"></head>
<body><nav>Home · About</nav></body></html>`;

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Example</title><link>https://example.com/</link>
<item><title>Entry</title><link>${ENTRY_URL}</link><guid>entry-1</guid></item>
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

function html(url: string, text: string): HttpTextResponse {
  return { url, contentType: 'text/html; charset=utf-8', text };
}

/** A fake safe fetcher serving fixed pages and counting requests per URL. */
function site(pages: Record<string, HttpTextResponse>) {
  const counts: Record<string, number> = {};
  const fetcher: HttpFetcher = {
    async fetch(url) {
      counts[url] = (counts[url] ?? 0) + 1;
      const page = pages[url];
      if (!page) throw new ExtractionError(`unexpected fetch: ${url}`);
      return page;
    },
  };
  return { fetcher, counts };
}

/** Mirrors the generic episode-page resolver: fetches the page, finds no audio, defers it. */
function deferringPodcast(fetcher: HttpFetcher): ItemAdapter {
  return {
    id: 'podcast',
    sourceType: 'podcast',
    recognize: (locator) => locator.url.startsWith('https://example.com/'),
    async resolveItem(locator) {
      const page = await fetcher.fetch(locator.url);
      throw new NotHandledError(`no podcast audio enclosure found at ${page.url}`, {
        deferredResponse: page,
      });
    },
    async extract() {
      throw new Error('unreachable');
    },
  };
}

function youtube(): ItemAdapter {
  return {
    id: 'youtube',
    sourceType: 'youtube',
    recognize: (locator) => locator.url.includes('youtube.com'),
    async extract() {
      throw new Error('unreachable');
    },
  };
}

function deps(
  pages: Record<string, HttpTextResponse>,
  options: { podcast?: boolean } = {},
): { deps: CliDeps; counts: Record<string, number> } {
  const { fetcher, counts } = site(pages);
  const itemAdapters: ItemAdapter[] = [youtube()];
  if (options.podcast !== false) itemAdapters.push(deferringPodcast(fetcher));
  itemAdapters.push(new ArticleAdapter({ fetcher }));
  return {
    deps: {
      extract: {
        itemAdapters,
        feedAdapter: new RssAdapter({ fetcher }),
        clock: () => new Date('2026-09-30T00:00:00.000Z'),
      },
    },
    counts,
  };
}

const withFeed = (pages: Record<string, HttpTextResponse>) => ({
  ...pages,
  [FEED_URL]: { url: FEED_URL, contentType: 'application/rss+xml', text: FEED },
  [ENTRY_URL]: html(ENTRY_URL, OG_ARTICLE),
});

describe('extract — article pages', () => {
  it.each([
    ['og:type article', OG_ARTICLE, 'Declared story'],
    ['JSON-LD @graph article', JSON_LD_ARTICLE, 'Graph story'],
    ['an undeclared readable body', UNDECLARED_ARTICLE, 'Undeclared story'],
  ])('extracts a page classified by %s as one document', async (_label, page, title) => {
    const { deps: d, counts } = deps(withFeed({ [ARTICLE_URL]: html(ARTICLE_URL, page) }));
    const { io, stdout } = capture();
    const code = await run(['extract', ARTICLE_URL, '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.command).toBe('extract');
    expect(envelope.result).toMatchObject({
      sourceType: 'article',
      canonicalUrl: ARTICLE_URL,
      title,
      provenance: { adapterId: 'article', warnings: [] },
    });
    expect(envelope.result.items).toBeUndefined();
    expect(counts[ARTICLE_URL]).toBe(1);
    expect(counts[FEED_URL]).toBeUndefined();
  });

  it('fetches the page once without a podcast adapter in front', async () => {
    const { deps: d, counts } = deps(withFeed({ [ARTICLE_URL]: html(ARTICLE_URL, OG_ARTICLE) }), {
      podcast: false,
    });
    const { io, stdout } = capture();
    const code = await run(['extract', ARTICLE_URL, '--json'], io, d);
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.sourceType).toBe('article');
    expect(counts[ARTICLE_URL]).toBe(1);
  });

  it('writes article text in plain mode', async () => {
    const { deps: d } = deps(withFeed({ [ARTICLE_URL]: html(ARTICLE_URL, OG_ARTICLE) }));
    const { io, stdout } = capture();
    const code = await run(['extract', ARTICLE_URL], io, d);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('This paragraph is part of a static article');
  });

  it('discovers the feed of a non-article page, reusing the fetched page', async () => {
    const { deps: d, counts } = deps(withFeed({ [PAGE_URL]: html(PAGE_URL, HOMEPAGE) }));
    const { io, stdout } = capture();
    const code = await run(['extract', PAGE_URL], io, d);

    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection.canonicalUrl).toBe(FEED_URL);
    expect(envelope.items).toHaveLength(1);
    expect(envelope.items[0]).toMatchObject({
      url: ENTRY_URL,
      document: { sourceType: 'article' },
    });
    expect(counts[PAGE_URL]).toBe(1);
  });

  it('fails with one error naming both paths when a page is neither', async () => {
    const { deps: d } = deps({ [PAGE_URL]: html(PAGE_URL, BARE_PAGE) });
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', PAGE_URL, '--json'], io, d);

    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    const record = JSON.parse(stderr().trim().split('\n').at(-1)!);
    expect(record).toMatchObject({ kind: 'error', code: 'CONFIGURATION_ERROR' });
    expect(record.message).toContain('no article content or RSS/Atom feed');
  });
});

describe('extract — --article and --feed', () => {
  it('--article extracts a page that auto-classification would send to discovery', async () => {
    const { deps: d, counts } = deps(withFeed({ [PAGE_URL]: html(PAGE_URL, HOMEPAGE) }));
    const { io, stdout } = capture();
    const code = await run(['extract', PAGE_URL, '--article', '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document).toMatchObject({
      sourceType: 'article',
      provenance: { adapterId: 'article', warnings: [] },
    });
    expect(counts[FEED_URL]).toBeUndefined();
  });

  it('--article fails when the page has no readable body', async () => {
    const { deps: d } = deps({ [PAGE_URL]: html(PAGE_URL, BARE_PAGE) });
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', PAGE_URL, '--article', '--json'], io, d);

    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(JSON.parse(stderr().trim().split('\n').at(-1)!)).toMatchObject({
      kind: 'error',
      code: 'EXTRACTION_ERROR',
    });
  });

  it('--feed discovers the feed of an article page', async () => {
    const { deps: d } = deps(withFeed({ [ARTICLE_URL]: html(ARTICLE_URL, OG_ARTICLE) }));
    const { io, stdout } = capture();
    const code = await run(['extract', ARTICLE_URL, '--feed'], io, d);

    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.collection.canonicalUrl).toBe(FEED_URL);
  });

  it.each([
    [['--article', '--feed'], 'cannot combine'],
    [['--article', '--podcast-media'], 'cannot combine'],
    [['--feed', '--podcast-page'], 'cannot combine'],
  ])('rejects %j as a usage error', async (flags, message) => {
    const { deps: d } = deps({});
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', ARTICLE_URL, ...flags], io, d);
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain(message);
  });

  it.each([
    ['a YouTube URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['a direct feed URL', FEED_URL],
  ])('rejects --article on %s as a usage error', async (_label, url) => {
    const { deps: d } = deps({});
    const { io, stderr } = capture();
    const code = await run(['extract', url, '--article'], io, d);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('--article');
  });
});

describe('extractWithFallback — article classification after a podcast deferral', () => {
  it('omits ARTICLE_FALLBACK for a page classified as an article', async () => {
    const { fetcher } = site({ [ARTICLE_URL]: html(ARTICLE_URL, OG_ARTICLE) });
    const { document } = await extractWithFallback(
      [deferringPodcast(fetcher), new ArticleAdapter({ fetcher })],
      { url: ARTICLE_URL },
    );
    expect(document.provenance.warnings).toEqual([]);
    expect(document.provenance.adapterId).toBe('article');
  });

  it('keeps ARTICLE_FALLBACK when a non-article page still yields text', async () => {
    const { fetcher } = site({ [PAGE_URL]: html(PAGE_URL, HOMEPAGE) });
    const { document } = await extractWithFallback(
      [deferringPodcast(fetcher), new ArticleAdapter({ fetcher })],
      { url: PAGE_URL },
    );
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      'ARTICLE_FALLBACK',
    ]);
  });
});

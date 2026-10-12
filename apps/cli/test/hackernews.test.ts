import { describe, expect, it } from 'vitest';
import type { CollectionAdapter, HttpFetcher, ItemAdapter } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { HackerNewsAdapter } from '@owlieio/adapter-hackernews';
import { defaultItemAdapters, ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const API = 'https://hacker-news.firebaseio.com/v0';
const ITEM_URL = 'https://news.ycombinator.com/item?id=1';
const TEXT_POST_URL = 'https://news.ycombinator.com/item?id=2';
const ARTICLE_URL = 'https://example.com/tool';

const API_ITEMS: Record<number, unknown> = {
  1: {
    id: 1,
    type: 'story',
    by: 'alice',
    time: 1_760_000_000,
    title: 'A useful tool',
    url: ARTICLE_URL,
    score: 50,
    descendants: 2,
    kids: [10],
  },
  2: { id: 2, type: 'story', by: 'bob', title: 'Ask HN: Why?', text: 'Because.', descendants: 0 },
  10: { id: 10, type: 'comment', by: 'c1', text: 'Nice tool', kids: [11] },
  11: { id: 11, type: 'comment', by: 'r1', text: 'Agreed' },
};

const PARAGRAPHS = `<p>${'This paragraph describes the tool in complete sentences with enough concrete detail to read as an article body. '.repeat(3)}</p>
<p>${'A second paragraph explains how to install it and what it is good for, so the extractor has prose to return. '.repeat(3)}</p>`;

const ARTICLE_PAGE = `<!doctype html><html><head><title>The tool</title>
<meta property="og:type" content="article"></head>
<body><main><article><h1>The tool</h1>${PARAGRAPHS}</article></main></body></html>`;

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

/** A fake fetcher for the official API and the linked article page. */
function network(options: { articleFails?: boolean } = {}): HttpFetcher {
  return {
    async fetch(url) {
      if (url === ARTICLE_URL) {
        if (options.articleFails) throw new ExtractionError(`HTTP 503 for ${url}?token=secret`);
        return { url, contentType: 'text/html; charset=utf-8', text: ARTICLE_PAGE };
      }
      const item = url.match(/\/item\/(\d+)\.json$/);
      if (item) {
        return {
          url,
          contentType: 'application/json',
          text: JSON.stringify(API_ITEMS[Number(item[1])] ?? null),
        };
      }
      if (url === `${API}/topstories.json`) {
        return { url, contentType: 'application/json', text: JSON.stringify([1, 2]) };
      }
      throw new ExtractionError(`unexpected fetch: ${url}`);
    },
  };
}

function extractDeps(options: { articleFails?: boolean } = {}): CliDeps {
  const fetcher = network(options);
  const itemAdapters: ItemAdapter[] = [
    new HackerNewsAdapter({ fetcher }),
    new ArticleAdapter({ fetcher }),
  ];
  return { extract: { itemAdapters, clock: () => new Date('2026-10-12T00:00:00.000Z') } };
}

async function extract(args: string[], deps: CliDeps = extractDeps()) {
  const out = capture();
  const code = await run(['extract', ...args, '--json'], out.io, deps);
  // Results go to stdout; error records are the last JSONL line on stderr.
  const lines = (out.stdout().trim() || out.stderr().trim()).split('\n');
  const envelope = JSON.parse(lines[lines.length - 1] ?? '{}');
  return { code, envelope, stderr: out.stderr() };
}

describe('owlie extract on a Hacker News item', () => {
  it('extracts the discussion by default', async () => {
    const { code, envelope } = await extract([ITEM_URL]);
    expect(code).toBe(ExitCode.Success);
    expect(envelope.result).toMatchObject({
      id: 'hackernews:item:1',
      sourceType: 'hackernews',
      canonicalUrl: ITEM_URL,
      title: 'A useful tool',
      metadata: { hnContent: 'discussion', commentsIncluded: 2, linkUrl: ARTICLE_URL },
      provenance: {
        sourceId: 'hackernews:item:1',
        adapterId: 'hackernews',
        fetchedAt: '2026-10-12T00:00:00.000Z',
      },
    });
    expect(envelope.result.text).toContain('[c1]\n  Nice tool');
    expect(envelope.result.text).toContain('    [r1]\n      Agreed');
  });

  it('extracts the linked article with --hn-content article', async () => {
    const { code, envelope } = await extract([ITEM_URL, '--hn-content', 'article']);
    expect(code).toBe(ExitCode.Success);
    expect(envelope.result.text).toContain('This paragraph describes the tool');
    expect(envelope.result.text).not.toContain('Nice tool');
    expect(envelope.result.metadata).toMatchObject({
      hnId: 1,
      hnContent: 'article',
      article: { canonicalUrl: ARTICLE_URL, title: 'The tool' },
    });
    expect(envelope.result.metadata).not.toHaveProperty('commentsIncluded');
    expect(envelope.result.provenance.adapterId).toBe('hackernews');
  });

  it('uses the post text when there is no linked article', async () => {
    const { code, envelope } = await extract([TEXT_POST_URL, '--hn-content', 'article']);
    expect(code).toBe(ExitCode.Success);
    expect(envelope.result.text).toContain('Because.');
    expect(envelope.result.provenance.warnings).toEqual([
      expect.objectContaining({ code: 'HN_NO_LINKED_ARTICLE' }),
    ]);
  });

  it('fails --hn-content article when the article cannot be read', async () => {
    const { code, envelope } = await extract(
      [ITEM_URL, '--hn-content', 'article'],
      extractDeps({ articleFails: true }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(envelope).toMatchObject({ kind: 'error', code: 'EXTRACTION_ERROR' });
  });

  it('puts the article before the discussion with --hn-content both', async () => {
    const { code, envelope } = await extract([ITEM_URL, '--hn-content', 'both']);
    expect(code).toBe(ExitCode.Success);
    const text: string = envelope.result.text;
    expect(text.startsWith('# Article\n\n')).toBe(true);
    expect(text.indexOf('# Discussion')).toBeGreaterThan(text.indexOf('This paragraph'));
    expect(text).toContain('Nice tool');
    expect(envelope.result.metadata).toMatchObject({
      hnContent: 'both',
      commentsIncluded: 2,
      article: { canonicalUrl: ARTICLE_URL },
    });
  });

  it('keeps the discussion with a warning when the article fails in both', async () => {
    const { code, envelope } = await extract(
      [ITEM_URL, '--hn-content', 'both'],
      extractDeps({ articleFails: true }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(envelope.result.text).not.toContain('# Article');
    expect(envelope.result.text).toContain('Nice tool');
    const [warning] = envelope.result.provenance.warnings;
    expect(warning.code).toBe('HN_ARTICLE_UNAVAILABLE');
    expect(warning.message).not.toContain('secret');
  });

  it('rejects a list URL with a hint to use list', async () => {
    const { code, envelope } = await extract(['https://news.ycombinator.com/']);
    expect(code).toBe(ExitCode.Error);
    expect(envelope.message).toContain('use "owlie list"');
  });

  it.each([
    [['https://example.com/', '--hn-content', 'both'], 'only be used with a Hacker News item URL'],
    [['https://example.com/', '--max-comments', '5'], 'only be used with a Hacker News item URL'],
    [[ITEM_URL, '--article'], '--article cannot be used with a Hacker News URL'],
    [[ITEM_URL, '--feed'], '--feed cannot be used with a Hacker News URL'],
    [[ITEM_URL, '--comment-depth', '4'], '--comment-depth must be at most 3'],
    [[ITEM_URL, '--max-comments', '301'], '--max-comments must be at most 300'],
    [[ITEM_URL, '--max-top-level-comments', '0'], 'must be a positive integer'],
    [
      [ITEM_URL, '--hn-content', 'comments'],
      '--hn-content must be "discussion", "article" or "both"',
    ],
  ])('rejects %j as a usage error', async (args, message) => {
    const { code, envelope } = await extract(args);
    expect(code).toBe(ExitCode.Usage);
    expect(envelope).toMatchObject({ kind: 'error', code: 'USAGE_ERROR' });
    expect(envelope.message).toContain(message);
  });

  it('passes the comment bounds to the registered adapter', async () => {
    const adapters = defaultItemAdapters({
      fetcher: network(),
      hackerNewsComments: { depth: 1 },
    });
    const hn = adapters.find((adapter) => adapter.id === 'hackernews');
    expect(hn).toBeDefined();
    const item = await hn!.resolveItem!({ url: ITEM_URL });
    const document = await hn!.extract(item);
    expect(document.metadata.commentsIncluded).toBe(1);
    expect(document.text).not.toContain('Agreed');
  });
});

describe('owlie list on Hacker News', () => {
  const hackerNewsAdapter = () => new HackerNewsAdapter({ fetcher: network() });

  it('lists the front page with HN metadata', async () => {
    const out = capture();
    const code = await run(
      ['list', 'https://news.ycombinator.com/', '--limit', '5', '--json'],
      out.io,
      { list: { hackerNewsAdapter: hackerNewsAdapter() } },
    );
    expect(code).toBe(ExitCode.Success);
    const { result } = JSON.parse(out.stdout());
    expect(result.collection).toMatchObject({
      id: 'hackernews:list:top',
      sourceType: 'hackernews',
      title: 'Hacker News: Front page',
    });
    expect(result.items[0]).toEqual({
      id: 'hackernews:item:1',
      sourceType: 'hackernews',
      canonicalUrl: ITEM_URL,
      title: 'A useful tool',
      publishedAt: new Date(1_760_000_000 * 1000).toISOString(),
      author: 'alice',
      metadata: { hnId: 1, kind: 'story', score: 50, commentCount: 2, linkUrl: ARTICLE_URL },
    });
    expect(result.items[1].metadata).toEqual({ hnId: 2, kind: 'ask', commentCount: 0 });
  });

  it('rejects an item URL with a hint to use extract', async () => {
    const out = capture();
    const code = await run(['list', ITEM_URL, '--json'], out.io, {
      list: { hackerNewsAdapter: hackerNewsAdapter() },
    });
    expect(code).toBe(ExitCode.Error);
    const lines = out.stderr().trim().split('\n');
    expect(JSON.parse(lines[lines.length - 1] ?? '{}').message).toContain('use "owlie extract"');
  });

  it('leaves the site RSS feed to the RSS adapter', async () => {
    const listed: string[] = [];
    const rss: CollectionAdapter = {
      id: 'rss',
      sourceType: 'rss',
      recognize: () => true,
      async resolve(locator) {
        listed.push(locator.url);
        return { id: 'rss:feed:x', sourceType: 'rss', canonicalUrl: locator.url, metadata: {} };
      },
      async list(collection) {
        return { collection, items: [], truncated: false };
      },
    };
    const out = capture();
    const code = await run(['list', 'https://news.ycombinator.com/rss', '--json'], out.io, {
      list: { adapter: rss },
    });
    expect(code).toBe(ExitCode.Success);
    expect(listed).toEqual(['https://news.ycombinator.com/rss']);
  });
});

import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  CollectionListOptions,
  ContentItem,
  ItemAdapter,
  NormalizedDocument,
} from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const FEED_URL = 'https://example.com/feed.xml';
const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const ARTICLE_URL = 'https://example.com/story-one';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

interface FakeItemOptions {
  recognize?: (url: string) => boolean;
  text?: string | ((url: string) => string);
  extractError?: (url: string) => unknown;
}

function makeItemAdapter(id: string, options: FakeItemOptions = {}) {
  const urls: string[] = [];
  const adapter: ItemAdapter = {
    id,
    sourceType: id === 'youtube' ? 'youtube' : 'article',
    recognize: (locator) => (options.recognize ? options.recognize(locator.url) : true),
    async resolveItem(locator) {
      urls.push(locator.url);
      return {
        id: `${id}:${locator.url}`,
        sourceType: id === 'youtube' ? ('youtube' as const) : ('article' as const),
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
    async extract(item: ContentItem, extractOptions) {
      extractOptions?.progress?.emit({ type: 'started', target: item.id });
      const error = options.extractError ? options.extractError(item.canonicalUrl) : undefined;
      if (error) throw error;
      const text =
        typeof options.text === 'function'
          ? options.text(item.canonicalUrl)
          : (options.text ?? `${id} text`);
      const document: NormalizedDocument = {
        schemaVersion: 1,
        id: item.id,
        sourceType: item.sourceType,
        canonicalUrl: item.canonicalUrl,
        mediaType: 'text',
        text,
        metadata: {},
      };
      extractOptions?.progress?.emit({ type: 'completed', target: item.id, result: document });
      return document;
    },
  };
  return { adapter, urls };
}

interface FakeFeedEntry {
  url: string;
  title?: string;
}

function makeFeedAdapter(entries: FakeFeedEntry[], listError?: unknown) {
  const calls: { limit?: number; signal?: AbortSignal } = {};
  const adapter: CollectionAdapter = {
    id: 'rss',
    sourceType: 'rss',
    recognize: (locator) => locator.url === FEED_URL,
    async resolve(locator) {
      return {
        id: `rss:feed:${locator.url}`,
        sourceType: 'rss',
        canonicalUrl: locator.url,
        title: 'Example Channel',
        metadata: { format: 'rss' },
      };
    },
    async list(collection, options: CollectionListOptions) {
      calls.limit = options.limit;
      calls.signal = options.signal;
      if (listError) throw listError;
      const items = entries.slice(0, options.limit).map((entry, index) => ({
        id: `rss:entry:${index}`,
        sourceType: 'rss' as const,
        canonicalUrl: entry.url,
        ...(entry.title !== undefined ? { title: entry.title } : {}),
        metadata: {},
      }));
      return { collection, items, truncated: entries.length > options.limit };
    },
  };
  return { adapter, calls };
}

function itemDeps(adapters: ItemAdapter[], feedAdapter?: CollectionAdapter): CliDeps {
  return { extract: { itemAdapters: adapters, feedAdapter } };
}

describe('extract — feed batch', () => {
  it('extracts a feed into a single JSON envelope regardless of --json', async () => {
    const youtube = makeItemAdapter('youtube', { recognize: (url) => url.includes('youtube.com') });
    const article = makeItemAdapter('article', { recognize: (url) => url.startsWith('https://') });
    const feed = makeFeedAdapter([
      { url: YT_URL, title: 'A video' },
      { url: ARTICLE_URL, title: 'A story' },
    ]);

    const { io, stdout, stderr } = capture();
    const code = await run(
      ['extract', FEED_URL],
      io,
      itemDeps([youtube.adapter, article.adapter], feed.adapter),
    );

    expect(code).toBe(ExitCode.Success);
    expect(stderr()).not.toContain('{');
    const envelope = JSON.parse(stdout());
    expect(envelope).toMatchObject({
      collection: {
        id: 'rss:feed:https://example.com/feed.xml',
        sourceType: 'rss',
        title: 'Example Channel',
      },
      truncated: false,
    });
    expect(envelope.items).toHaveLength(2);
    expect(envelope.items[0]).toMatchObject({
      url: YT_URL,
      title: 'A video',
      document: { sourceType: 'youtube', text: 'youtube text' },
    });
    expect(envelope.items[1]).toMatchObject({
      url: ARTICLE_URL,
      title: 'A story',
      document: { sourceType: 'article', text: 'article text' },
    });
  });

  it('preserves feed order and dispatches specialized adapters first', async () => {
    const youtube = makeItemAdapter('youtube', { recognize: (url) => url.includes('youtube.com') });
    const article = makeItemAdapter('article', { recognize: (url) => url.startsWith('https://') });
    const feed = makeFeedAdapter([
      { url: ARTICLE_URL },
      { url: YT_URL },
      { url: 'https://example.com/story-two' },
    ]);

    const { io, stdout } = capture();
    const code = await run(
      ['extract', FEED_URL],
      io,
      itemDeps([youtube.adapter, article.adapter], feed.adapter),
    );
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.items.map((item: { url: string }) => item.url)).toEqual([
      ARTICLE_URL,
      YT_URL,
      'https://example.com/story-two',
    ]);
    expect(
      envelope.items.map((item: { document: { sourceType: string } }) => item.document.sourceType),
    ).toEqual(['article', 'youtube', 'article']);
  });

  it('omits title from an item record when the entry has none', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([{ url: ARTICLE_URL }]);
    const { io, stdout } = capture();
    const code = await run(['extract', FEED_URL], io, itemDeps([article.adapter], feed.adapter));
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.items[0]).not.toHaveProperty('title');
    expect(envelope.items[0]).toHaveProperty('document');
  });

  it('records a structured error and exits 1 on a per-item failure, continuing the batch', async () => {
    const article = makeItemAdapter('article', {
      extractError: (url) =>
        url === ARTICLE_URL ? new ExtractionError('no readable content') : undefined,
    });
    const feed = makeFeedAdapter([
      { url: ARTICLE_URL, title: 'Bad' },
      { url: 'https://example.com/story-two', title: 'Good' },
    ]);
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', FEED_URL], io, itemDeps([article.adapter], feed.adapter));
    expect(code).toBe(ExitCode.Error);
    // stdout carries only the envelope; the error message never leaks to stderr
    expect(stderr()).not.toContain('no readable content');
    const envelope = JSON.parse(stdout());
    expect(envelope.items).toHaveLength(2);
    expect(envelope.items[0]).toMatchObject({
      url: ARTICLE_URL,
      title: 'Bad',
      error: { code: 'EXTRACTION_ERROR', message: 'no readable content', stage: 'extraction' },
    });
    expect(envelope.items[0]).not.toHaveProperty('document');
    expect(envelope.items[1]).toHaveProperty('document');
  });

  it('defaults to a limit of 10 and applies an explicit --limit with truncation', async () => {
    const article = makeItemAdapter('article');
    const entries = Array.from({ length: 12 }, (_, i) => ({ url: `https://example.com/${i}` }));
    const feed = makeFeedAdapter(entries);

    const first = capture();
    const defaultCode = await run(
      ['extract', FEED_URL],
      first.io,
      itemDeps([article.adapter], feed.adapter),
    );
    expect(defaultCode).toBe(ExitCode.Success);
    expect(feed.calls.limit).toBe(10);
    expect(JSON.parse(first.stdout()).truncated).toBe(true);

    const second = capture();
    const code = await run(
      ['extract', FEED_URL, '--limit', '2'],
      second.io,
      itemDeps([article.adapter], feed.adapter),
    );
    expect(code).toBe(ExitCode.Success);
    expect(feed.calls.limit).toBe(2);
    const envelope = JSON.parse(second.stdout());
    expect(envelope.items).toHaveLength(2);
    expect(envelope.truncated).toBe(true);
  });

  it('rejects invalid limits as errors before any extraction', async () => {
    for (const bad of ['0', 'abc', '501']) {
      const article = makeItemAdapter('article');
      const feed = makeFeedAdapter([{ url: ARTICLE_URL }]);
      const { io, stdout, stderr } = capture();
      const code = await run(
        ['extract', FEED_URL, '--limit', bad],
        io,
        itemDeps([article.adapter], feed.adapter),
      );
      expect(code).toBe(ExitCode.Error);
      expect(stdout()).toBe('');
      expect(stderr()).toMatch(/limit/);
    }
  });

  it('maps a feed listing failure to exit 1', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([], new ExtractionError('feed unreadable'));
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', FEED_URL], io, itemDeps([article.adapter], feed.adapter));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('feed unreadable');
  });

  it('suppresses diagnostics with --quiet', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([{ url: ARTICLE_URL, title: 'A story' }]);
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['extract', FEED_URL, '--quiet'],
      io,
      itemDeps([article.adapter], feed.adapter),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).items).toHaveLength(1);
    expect(stderr()).toBe('');
  });

  it('stops starting new items after cancellation and exits 1', async () => {
    const controller = new AbortController();
    let extractions = 0;
    const article = makeItemAdapter('article', { text: 'body' });
    const extract = article.adapter.extract.bind(article.adapter);
    article.adapter.extract = async (item, extractOptions) => {
      extractions += 1;
      const document = await extract(item, extractOptions);
      controller.abort();
      return document;
    };
    const feed = makeFeedAdapter([
      { url: 'https://example.com/1' },
      { url: 'https://example.com/2' },
      { url: 'https://example.com/3' },
    ]);
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', FEED_URL], io, {
      extract: {
        itemAdapters: [article.adapter],
        feedAdapter: feed.adapter,
        signal: controller.signal,
      },
    });
    expect(code).toBe(ExitCode.Error);
    expect(extractions).toBe(1);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cancelled');
  });
});

describe('extract — direct dispatch', () => {
  it('extracts a direct article URL through the article adapter', async () => {
    const youtube = makeItemAdapter('youtube', { recognize: (url) => url.includes('youtube.com') });
    const article = makeItemAdapter('article', {
      recognize: (url) => url.startsWith('https://'),
      text: 'article body',
    });
    const feed = makeFeedAdapter([]);

    const { io, stdout } = capture();
    const code = await run(
      ['extract', ARTICLE_URL],
      io,
      itemDeps([youtube.adapter, article.adapter], feed.adapter),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('article body\n');
  });

  it('extracts a direct article URL as a JSON document with --json', async () => {
    const article = makeItemAdapter('article', { text: 'article body' });
    const feed = makeFeedAdapter([]);
    const { io, stdout } = capture();
    const code = await run(
      ['extract', ARTICLE_URL, '--json'],
      io,
      itemDeps([article.adapter], feed.adapter),
    );
    expect(code).toBe(ExitCode.Success);
    const doc = JSON.parse(stdout());
    expect(doc.text).toBe('article body');
    expect(doc.sourceType).toBe('article');
  });

  it('fails with a clear error when no adapter recognizes a direct URL', async () => {
    const article = makeItemAdapter('article', { recognize: () => false });
    const feed = makeFeedAdapter([]);
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['extract', 'ftp://example.com/x'],
      io,
      itemDeps([article.adapter], feed.adapter),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('no adapter recognizes URL');
  });
});

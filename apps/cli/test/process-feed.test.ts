import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  CollectionListOptions,
  ContentItem,
  ContentProcessor,
  HttpFetcher,
  ItemAdapter,
  NormalizedDocument,
  ProcessRequest,
} from '@owlieio/core';
import { ExtractionError, ProcessingError } from '@owlieio/core';
import { RssAdapter } from '@owlieio/adapter-rss';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const FEED_URL = 'https://example.com/feed.xml';
const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const ARTICLE_URL = 'https://example.com/story-one';

/** Sanitized RSS 2.0 fixture (no credentials, user data, or network content). */
const RSS20 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example Channel</title>
  <link>https://example.com/</link>
  <description>A sample feed</description>
  <item>
    <title>A video</title>
    <link>https://www.youtube.com/watch?v=dQw4w9WgXcQ</link>
    <guid isPermaLink="false">post-1</guid>
    <description>Summary &amp; teaser</description>
  </item>
  <item>
    <title>A story</title>
    <link>https://example.com/story-one</link>
    <guid isPermaLink="false">post-2</guid>
    <description>Summary</description>
  </item>
</channel></rss>`;

function capture(stdin: { isTTY: boolean } = { isTTY: true }) {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    stdin: { isTTY: stdin.isTTY, read: async () => '' },
  };
  return {
    io,
    stdout: () => stdout,
    stderr: () => stderr,
    jsonl: () =>
      stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
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

function makeFeedAdapter(entries: { url: string; title?: string }[], listError?: unknown) {
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

function makeProcessor(opts: { error?: unknown; failUrl?: string } = {}) {
  const requests: ProcessRequest[] = [];
  const processor: ContentProcessor = {
    id: 'fake',
    async process(request) {
      requests.push(request);
      if (
        opts.error &&
        (opts.failUrl === undefined || request.document.canonicalUrl === opts.failUrl)
      ) {
        throw opts.error;
      }
      return {
        output: `processed:${request.document.text}`,
        format: 'text' as const,
        metadata: { model: 'deepseek-chat' },
      };
    },
  };
  return { processor, requests };
}

function feedDeps(
  adapters: ItemAdapter[],
  feedAdapter: CollectionAdapter,
  processor: ContentProcessor,
  extra: Partial<CliDeps['process']> = {},
): CliDeps {
  return { process: { itemAdapters: adapters, feedAdapter, processor, ...extra } };
}

describe('process --each (feed collection mode)', () => {
  it('processes a feed and emits one JSONL success record per entry', async () => {
    const youtube = makeItemAdapter('youtube', { recognize: (url) => url.includes('youtube.com') });
    const article = makeItemAdapter('article', { recognize: (url) => url.startsWith('https://') });
    const feed = makeFeedAdapter([
      { url: YT_URL, title: 'A video' },
      { url: ARTICLE_URL, title: 'A story' },
    ]);
    const { processor, requests } = makeProcessor();

    const { io, stdout, jsonl } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'Summarize'],
      io,
      feedDeps([youtube.adapter, article.adapter], feed.adapter, processor),
    );

    expect(code).toBe(ExitCode.Success);
    const records = jsonl();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      item: { url: YT_URL, title: 'A video' },
      document: { sourceType: 'youtube', text: 'youtube text' },
      result: { output: 'processed:youtube text' },
    });
    expect(records[1]).toMatchObject({
      item: { url: ARTICLE_URL, title: 'A story' },
      document: { sourceType: 'article' },
      result: { output: 'processed:article text' },
    });
    expect(records[0].error).toBeUndefined();
    // one processor call per successfully extracted document, in feed order
    expect(requests.map((r) => r.document.canonicalUrl)).toEqual([YT_URL, ARTICLE_URL]);
    expect(requests.every((r) => r.instruction === 'Summarize')).toBe(true);
    // stdout carries only JSONL; progress stays off stdout
    expect(
      stdout()
        .split('\n')
        .filter(Boolean)
        .every((line) => line.startsWith('{')),
    ).toBe(true);
  });

  it('records an extraction error, continues, and exits 1', async () => {
    const article = makeItemAdapter('article', {
      extractError: (url) =>
        url === ARTICLE_URL ? new ExtractionError('no readable content') : undefined,
    });
    const feed = makeFeedAdapter([
      { url: ARTICLE_URL, title: 'Bad' },
      { url: 'https://example.com/story-two', title: 'Good' },
    ]);
    const { processor, requests } = makeProcessor();

    const { io, jsonl, stderr } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );

    expect(code).toBe(ExitCode.Error);
    expect(stderr()).not.toContain('no readable content');
    const records = jsonl();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      item: { url: ARTICLE_URL, title: 'Bad' },
      error: { code: 'EXTRACTION_ERROR', message: 'no readable content', stage: 'extraction' },
    });
    expect(records[0].document).toBeUndefined();
    expect(records[1]).toHaveProperty('result');
    // the failed entry was never handed to the processor
    expect(requests.map((r) => r.document.canonicalUrl)).toEqual(['https://example.com/story-two']);
  });

  it('records a processing error, continues, and exits 1', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([
      { url: ARTICLE_URL, title: 'Fails' },
      { url: 'https://example.com/story-two', title: 'Works' },
    ]);
    const { processor } = makeProcessor({
      error: new ProcessingError('model unavailable'),
      failUrl: ARTICLE_URL,
    });

    const { io, jsonl } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );

    expect(code).toBe(ExitCode.Error);
    const records = jsonl();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      item: { url: ARTICLE_URL, title: 'Fails' },
      error: { code: 'PROCESSING_ERROR', message: 'model unavailable', stage: 'processing' },
    });
    expect(records[0].result).toBeUndefined();
    expect(records[1]).toHaveProperty('result');
  });

  it('omits title from the item reference when the entry has none', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([{ url: ARTICLE_URL }]);
    const { processor } = makeProcessor();
    const { io, jsonl } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(code).toBe(ExitCode.Success);
    expect(jsonl()[0].item).toEqual({ url: ARTICLE_URL });
  });

  it('defaults to a limit of 10 and honors --limit', async () => {
    const article = makeItemAdapter('article');
    const entries = Array.from({ length: 12 }, (_, i) => ({ url: `https://example.com/${i}` }));
    const feed = makeFeedAdapter(entries);
    const { processor } = makeProcessor();

    const first = capture();
    await run(
      ['process', FEED_URL, '--each', '--prompt', 'x'],
      first.io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(feed.calls.limit).toBe(10);

    const second = capture();
    await run(
      ['process', FEED_URL, '--each', '--prompt', 'x', '--limit', '3'],
      second.io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(feed.calls.limit).toBe(3);
  });

  it('rejects invalid limits as errors', async () => {
    for (const bad of ['0', 'abc', '501']) {
      const article = makeItemAdapter('article');
      const feed = makeFeedAdapter([{ url: ARTICLE_URL }]);
      const { processor } = makeProcessor();
      const { io, stdout, stderr } = capture();
      const code = await run(
        ['process', FEED_URL, '--each', '--prompt', 'x', '--limit', bad],
        io,
        feedDeps([article.adapter], feed.adapter, processor),
      );
      expect(code).toBe(ExitCode.Error);
      expect(stdout()).toBe('');
      expect(stderr()).toMatch(/limit/);
    }
  });

  it('rejects --each combined with --input as a usage error', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([]);
    const { processor } = makeProcessor();
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--input', 'a.txt', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('--each');
  });

  it('rejects --each combined with piped stdin as a usage error', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([]);
    const { processor } = makeProcessor();
    const { io, stdout, stderr } = capture({ isTTY: false });
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('piped stdin');
  });

  it('rejects --each without a feed URL as a usage error', async () => {
    const { io, stderr } = capture();
    const code = await run(['process', '--each', '--prompt', 'x'], io);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('--each requires a feed URL');
  });

  it('rejects --each with a non-feed URL as a usage error', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([]);
    const { processor } = makeProcessor();
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['process', ARTICLE_URL, '--each', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('feed');
  });

  it('maps a feed listing failure to exit 1', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([], new ExtractionError('feed unreadable'));
    const { processor } = makeProcessor();
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('feed unreadable');
  });

  it('suppresses diagnostics with --quiet while keeping JSONL on stdout', async () => {
    const article = makeItemAdapter('article');
    const feed = makeFeedAdapter([{ url: ARTICLE_URL, title: 'A story' }]);
    const { processor } = makeProcessor();
    const { io, stdout, stderr, jsonl } = capture();
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x', '--quiet'],
      io,
      feedDeps([article.adapter], feed.adapter, processor),
    );
    expect(code).toBe(ExitCode.Success);
    expect(jsonl()).toHaveLength(1);
    expect(stdout().startsWith('{')).toBe(true);
    expect(stderr()).toBe('');
  });

  it('processes a real RSS feed end-to-end through RssAdapter with injected extractors', async () => {
    const fetcher: HttpFetcher = {
      async fetch(url) {
        return { url, contentType: 'application/rss+xml', text: RSS20 };
      },
      async fetchText() {
        return RSS20;
      },
    };
    const youtube = makeItemAdapter('youtube', { recognize: (url) => url.includes('youtube.com') });
    const article = makeItemAdapter('article', { recognize: (url) => url.startsWith('https://') });
    const { processor, requests } = makeProcessor();

    const { io, jsonl } = capture();
    const code = await run(['process', FEED_URL, '--each', '--prompt', 'Summarize'], io, {
      process: {
        itemAdapters: [youtube.adapter, article.adapter],
        feedAdapter: new RssAdapter({ fetcher }),
        processor,
      },
    });

    expect(code).toBe(ExitCode.Success);
    const records = jsonl();
    expect(records).toHaveLength(2);
    expect(records.map((r: { item: { title: string } }) => r.item.title)).toEqual([
      'A video',
      'A story',
    ]);
    expect(records.map((r: { document: { sourceType: string } }) => r.document.sourceType)).toEqual(
      ['youtube', 'article'],
    );
    expect(requests.map((r) => r.document.canonicalUrl)).toEqual([YT_URL, ARTICLE_URL]);
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
    const { processor } = makeProcessor();
    const { io, stderr } = capture();
    const code = await run(['process', FEED_URL, '--each', '--prompt', 'x'], io, {
      process: {
        itemAdapters: [article.adapter],
        feedAdapter: feed.adapter,
        processor,
        signal: controller.signal,
      },
    });
    expect(code).toBe(ExitCode.Error);
    expect(extractions).toBe(1);
    expect(stderr()).toContain('cancelled');
  });
});

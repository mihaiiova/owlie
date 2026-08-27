import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  CollectionListOptions,
  ContentItem,
  DnsResolver,
  HttpFetcher,
  HttpFetchFn,
} from '@owlieio/core';
import { CancelledError, DefaultHttpFetcher, ExtractionError } from '@owlieio/core';
import { RssAdapter } from '@owlieio/adapter-rss';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const FEED_URL = 'https://example.com/feed.xml';

/** Sanitized RSS 2.0 fixture (no credentials, user data, or network content). */
const RSS20 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example Channel</title>
  <link>https://example.com/</link>
  <description>A sample feed</description>
  <item>
    <title>First post</title>
    <link>https://example.com/1</link>
    <guid isPermaLink="false">post-1</guid>
    <description>Summary &amp; teaser</description>
    <pubDate>Tue, 19 Aug 2025 10:00:00 GMT</pubDate>
    <dc:creator>alice</dc:creator>
  </item>
</channel></rss>`;

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

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'rss:entry:post-1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/1',
    title: 'First post',
    description: 'Summary & teaser',
    publishedAt: '2025-08-19T10:00:00.000Z',
    author: 'alice',
    metadata: { entryId: 'post-1', feedUrl: FEED_URL, content: '<p>Full body</p>' },
    ...overrides,
  };
}

function makeAdapter(
  behavior: {
    items?: ContentItem[];
    listError?: unknown;
    title?: string;
  } = {},
) {
  const items = behavior.items ?? [
    makeItem(),
    makeItem({
      id: 'rss:entry:post-2',
      title: 'Second post',
      canonicalUrl: 'https://example.com/2',
      publishedAt: '2025-08-20T11:00:00.000Z',
    }),
  ];
  const calls: { limit?: number; signal?: AbortSignal } = {};
  const adapter: CollectionAdapter = {
    id: 'rss',
    sourceType: 'rss',
    recognize: () => true,
    async resolve(locator) {
      return {
        id: `rss:feed:${locator.url}`,
        sourceType: 'rss',
        canonicalUrl: locator.url,
        title: behavior.title ?? 'Example Channel',
        metadata: { format: 'rss' },
      };
    },
    async list(collection, options: CollectionListOptions) {
      calls.limit = options.limit;
      calls.signal = options.signal;
      if (behavior.listError) throw behavior.listError;
      return {
        collection,
        items: items.slice(0, options.limit),
        truncated: items.length > options.limit,
      };
    },
  };
  return { adapter, calls, itemCount: items.length };
}

function deps(adapter: CollectionAdapter, extra: Partial<CliDeps['list']> = {}): CliDeps {
  return { list: { adapter, ...extra } };
}

describe('list command', () => {
  it('writes a line-oriented summary to stdout', async () => {
    const { adapter } = makeAdapter();
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('Example Channel');
    expect(stdout()).toContain('First post');
    expect(stdout()).toContain('https://example.com/1');
    expect(stdout()).not.toContain('<p>');
    expect(stderr()).toContain('listing');
  });

  it('emits a JSON envelope with --json', async () => {
    const { adapter } = makeAdapter();
    const { io, stdout } = capture();
    const code = await run(['list', FEED_URL, '--json'], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.collection).toMatchObject({
      id: 'rss:feed:https://example.com/feed.xml',
      sourceType: 'rss',
      title: 'Example Channel',
    });
    expect(envelope.items).toHaveLength(2);
    expect(envelope.items[0]).toMatchObject({
      id: 'rss:entry:post-1',
      sourceType: 'rss',
      canonicalUrl: 'https://example.com/1',
      title: 'First post',
      description: 'Summary & teaser',
      publishedAt: '2025-08-19T10:00:00.000Z',
      author: 'alice',
    });
    expect(envelope.truncated).toBe(false);
    expect(stdout()).not.toContain('<p>');
  });

  it('defaults to a limit of 10', async () => {
    const { adapter, calls } = makeAdapter();
    const { io } = capture();
    const code = await run(['list', FEED_URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    expect(calls.limit).toBe(10);
  });

  it('applies an explicit --limit and reports truncation', async () => {
    const { adapter, calls, itemCount } = makeAdapter();
    const { io, stdout } = capture();
    const code = await run(['list', FEED_URL, '--limit', '1', '--json'], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    expect(calls.limit).toBe(1);
    const envelope = JSON.parse(stdout());
    expect(envelope.items).toHaveLength(1);
    expect(envelope.truncated).toBe(itemCount > 1);
  });

  it('rejects invalid bounds as errors', async () => {
    for (const bad of ['0', 'abc', '501']) {
      const { adapter } = makeAdapter();
      const { io, stdout, stderr } = capture();
      const code = await run(['list', FEED_URL, '--limit', bad], io, deps(adapter));
      expect(code).toBe(ExitCode.Error);
      expect(stdout()).toBe('');
      expect(stderr()).toMatch(/limit/);
    }
  });

  it('maps an adapter failure to exit code 1 with a clear message', async () => {
    const { adapter } = makeAdapter({ listError: new ExtractionError('boom') });
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('boom');
  });

  it('does not expose URL query or fragment secrets in fetch diagnostics', async () => {
    const fetchFn: HttpFetchFn = async () => new Response('', { status: 500 });
    const resolver: DnsResolver = async () => ['8.8.8.8'];
    const adapter = new RssAdapter({ fetcher: new DefaultHttpFetcher(fetchFn, resolver) });
    const url = 'https://example.com/feed.xml?token=query-secret#fragment-secret';
    const { io, stdout, stderr } = capture();

    const code = await run(['list', url], io, deps(adapter));

    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('https://example.com/feed.xml');
    expect(stderr()).not.toContain('query-secret');
    expect(stderr()).not.toContain('fragment-secret');
  });

  it('maps cancellation to exit code 1', async () => {
    const { adapter } = makeAdapter({ listError: new CancelledError('cancelled') });
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cancelled');
  });

  it('suppresses diagnostics with --quiet', async () => {
    const { adapter } = makeAdapter();
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL, '--quiet'], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('First post');
    expect(stderr()).toBe('');
  });

  it('passes the injected signal through to listing', async () => {
    const { adapter, calls } = makeAdapter();
    const controller = new AbortController();
    const { io } = capture();
    const code = await run(['list', FEED_URL], io, deps(adapter, { signal: controller.signal }));
    expect(code).toBe(ExitCode.Success);
    expect(calls.signal).toBe(controller.signal);
  });

  it('rejects a missing URL as a usage error', async () => {
    const { adapter } = makeAdapter();
    const { io, stdout, stderr } = capture();
    const code = await run(['list'], io, deps(adapter));
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('requires a URL');
  });

  it('rejects extra arguments as a usage error', async () => {
    const { adapter } = makeAdapter();
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL, 'extra'], io, deps(adapter));
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('unexpected argument');
  });

  it('lists a real feed end-to-end through RssAdapter with an injected fetcher', async () => {
    const fetcher: HttpFetcher = {
      async fetch(url) {
        return { url, contentType: 'application/rss+xml', text: RSS20 };
      },
      async fetchText() {
        return RSS20;
      },
    };
    const { io, stdout } = capture();
    const code = await run(['list', FEED_URL, '--json'], io, {
      list: { adapter: new RssAdapter({ fetcher }) },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope.collection).toMatchObject({
      id: 'rss:feed:https://example.com/feed.xml',
      sourceType: 'rss',
      canonicalUrl: FEED_URL,
    });
    expect(envelope.items).toHaveLength(1);
    expect(envelope.items[0]).toMatchObject({
      id: 'rss:entry:post-1',
      canonicalUrl: 'https://example.com/1',
      title: 'First post',
      description: 'Summary & teaser',
      publishedAt: '2025-08-19T10:00:00.000Z',
      author: 'alice',
    });
    expect(envelope.truncated).toBe(false);
  });

  it('starts and stops a spinner', async () => {
    const { adapter } = makeAdapter();
    const starts: string[] = [];
    let stopped = 0;
    const { io } = capture();
    const code = await run(['list', FEED_URL], io, {
      list: {
        adapter,
        spinner: {
          start: (message) => starts.push(message),
          stop: () => {
            stopped += 1;
          },
        },
      },
    });
    expect(code).toBe(ExitCode.Success);
    expect(starts).toEqual(['listing feed']);
    expect(stopped).toBe(1);
  });
});

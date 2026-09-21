import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  CollectionListOptions,
  ContentItem,
  ContentProcessor,
  HttpFetchPolicy,
  ItemAdapter,
  NormalizedDocument,
  ProcessRequest,
} from '@owlieio/core';
import { CancelledError, ExtractionError, buildProvenance } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const FEED_URL = 'https://example.com/feed.xml';
const ARTICLE_URL = 'https://example.com/story';

function capture(stdin: { isTTY: boolean; content?: string } = { isTTY: false, content: '' }) {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: stdin.isTTY, read: async () => stdin.content ?? '' },
  };
  return {
    io,
    stdout: () => stdout,
    stderr: () => stderr,
    stderrLines: () =>
      stderr
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}

function neverAfterAbortAdapter(): CollectionAdapter {
  return {
    id: 'rss',
    sourceType: 'rss',
    recognize: (locator) => locator.url === FEED_URL,
    async resolve(locator) {
      return {
        id: `rss:feed:${locator.url}`,
        sourceType: 'rss',
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
    async list(_collection, options: CollectionListOptions) {
      await new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(new CancelledError('listing cancelled')),
          { once: true },
        );
      });
      throw new Error('unreachable');
    },
  };
}

function articleAdapter(text = 'article body'): ItemAdapter {
  return {
    id: 'article',
    sourceType: 'article',
    recognize: (locator) => locator.url.startsWith('https://'),
    async resolveItem(locator) {
      return {
        id: `article:${locator.url}`,
        sourceType: 'article',
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
    async extract(item: ContentItem): Promise<NormalizedDocument> {
      return {
        schemaVersion: 2,
        id: item.id,
        sourceType: 'article',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'text',
        text,
        metadata: {},
        provenance: buildProvenance({
          sourceId: item.id,
          canonicalUrl: item.canonicalUrl,
          adapterId: 'article',
          text,
          fetchedAt: '2026-09-21T00:00:00.000Z',
        }),
      };
    },
  };
}

describe('invocation-wide timeout deadline', () => {
  it('rejects an invalid --timeout-ms as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL, '--timeout-ms', '0'], io, {
      list: { adapter: neverAfterAbortAdapter() },
    });
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('--timeout-ms must be a positive integer');
  });

  it('reaches list and exits 130 with a cancellation record', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL, '--timeout-ms', '10', '--json'], io, {
      list: { adapter: neverAfterAbortAdapter() },
    });
    expect(code).toBe(ExitCode.Cancelled);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cancelled');
  });

  it('reaches resolve and exits 130 when resolution observes the deadline', async () => {
    // The episode-page resolver fetches through the injected seam, which never
    // yields and only rejects once the deadline aborts the shared signal.
    const fetcher = {
      async fetch(url: string, options?: { signal?: AbortSignal }) {
        await new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new CancelledError('resolution cancelled')),
            { once: true },
          );
        });
        throw new Error(`unreachable ${url}`);
      },
    };
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['resolve', 'https://example.com/episode', '--podcast-page', '--timeout-ms', '10', '--json'],
      io,
      { resolve: { fetcher } },
    );
    expect(code).toBe(ExitCode.Cancelled);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cancelled');
  });

  it('reaches provider processing and exits 130', async () => {
    const processor: ContentProcessor = {
      id: 'fake',
      async process(_request: ProcessRequest, options) {
        await new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new CancelledError('processing cancelled')),
            { once: true },
          );
        });
        throw new Error('unreachable');
      },
    };
    const { io, stdout, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'x', '--timeout-ms', '10'], io, {
      process: { processor },
    });
    expect(code).toBe(ExitCode.Cancelled);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cancelled');
  });

  it('stops a feed batch from starting new items after the deadline', async () => {
    let extractions = 0;
    const adapter = articleAdapter();
    const extract = adapter.extract.bind(adapter);
    adapter.extract = async (item, options) => {
      extractions += 1;
      const document = await extract(item, options);
      // Wait for the deadline to fire before returning.
      await new Promise<void>((resolve) => setTimeout(resolve, 15));
      return document;
    };
    const feed: CollectionAdapter = {
      id: 'rss',
      sourceType: 'rss',
      recognize: (locator) => locator.url === FEED_URL,
      async resolve(locator) {
        return {
          id: `rss:feed:${locator.url}`,
          sourceType: 'rss',
          canonicalUrl: locator.url,
          metadata: {},
        };
      },
      async list(collection, options: CollectionListOptions) {
        const items = Array.from({ length: options.limit }, (_, i) => ({
          id: `rss:entry:${i}`,
          sourceType: 'rss' as const,
          canonicalUrl: `https://example.com/${i}`,
          metadata: {},
        }));
        return { collection, items, truncated: false };
      },
    };
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', FEED_URL, '--timeout-ms', '10'], io, {
      extract: { itemAdapters: [adapter], feedAdapter: feed },
    });
    expect(code).toBe(ExitCode.Cancelled);
    expect(extractions).toBe(1);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cancelled');
  });
});

describe('stdout byte budget', () => {
  it('rejects an oversize result as a distinct error before the protocol boundary', async () => {
    const { io, stdout, stderr, stderrLines } = capture();
    const code = await run(['extract', ARTICLE_URL, '--max-stdout-bytes', '16', '--json'], io, {
      extract: { itemAdapters: [articleAdapter('this body is far too long')] },
    });
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('stdout exceeded');
    expect(stderrLines()[0]).toMatchObject({
      kind: 'error',
      code: 'OUTPUT_LIMIT_EXCEEDED',
    });
  });

  it('rejects an invalid budget as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', ARTICLE_URL, '--max-stdout-bytes', '0'], io, {
      extract: { itemAdapters: [articleAdapter()] },
    });
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('--max-stdout-bytes must be a positive integer');
  });

  it('allows output within budget', async () => {
    const { io, stdout } = capture();
    const code = await run(['extract', ARTICLE_URL, '--max-stdout-bytes', '1024'], io, {
      extract: { itemAdapters: [articleAdapter('hello')] },
    });
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('hello\n');
  });
});

describe('network byte budget flags', () => {
  it('rejects an invalid --max-network-bytes as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL, '--max-network-bytes', 'abc'], io, {
      list: { adapter: neverAfterAbortAdapter() },
    });
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('--max-network-bytes must be a positive integer');
  });

  it('keeps ordinary failures distinct from cancellation', async () => {
    const adapter = neverAfterAbortAdapter();
    adapter.list = async () => {
      throw new ExtractionError('feed unreadable');
    };
    const { io, stdout, stderr } = capture();
    const code = await run(['list', FEED_URL], io, { list: { adapter } });
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('feed unreadable');
    expect(stderr()).not.toContain('cancelled');
  });
});

describe('stdout streaming bound', () => {
  it('bounds --each records and reports OUTPUT_LIMIT_EXCEEDED', async () => {
    const feed: CollectionAdapter = {
      id: 'rss',
      sourceType: 'rss',
      recognize: (locator) => locator.url === FEED_URL,
      async resolve(locator) {
        return {
          id: `rss:feed:${locator.url}`,
          sourceType: 'rss',
          canonicalUrl: locator.url,
          metadata: {},
        };
      },
      async list(collection) {
        return {
          collection,
          items: [
            {
              id: 'rss:entry:0',
              sourceType: 'rss' as const,
              canonicalUrl: ARTICLE_URL,
              metadata: {},
            },
          ],
          truncated: false,
        };
      },
    };
    const processor: ContentProcessor = {
      id: 'fake',
      async process() {
        return { output: 'processed output', format: 'text' as const, metadata: {} };
      },
    };
    const { io, stderr, stderrLines } = capture({ isTTY: true });
    const code = await run(
      ['process', FEED_URL, '--each', '--prompt', 'x', '--max-stdout-bytes', '32', '--json'],
      io,
      {
        process: {
          itemAdapters: [articleAdapter('a long article body')],
          feedAdapter: feed,
          processor,
        },
      },
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('stdout exceeded');
    expect(
      stderrLines().some(
        (line: { kind?: string; code?: string }) =>
          line.kind === 'error' && line.code === 'OUTPUT_LIMIT_EXCEEDED',
      ),
    ).toBe(true);
  });
});

describe('network byte budget propagation', () => {
  it('threads --max-network-bytes into the resolve fetch policy as a shared budget', async () => {
    const seenPolicies: Array<HttpFetchPolicy | undefined> = [];
    const fetcher = {
      async fetch(url: string, options?: { policy?: HttpFetchPolicy }) {
        seenPolicies.push(options?.policy);
        return { url, contentType: 'text/html', text: '<html><body>no audio</body></html>' };
      },
    };
    const { io } = capture();
    await run(
      ['resolve', 'https://example.com/episode', '--podcast-page', '--max-network-bytes', '100'],
      io,
      { resolve: { fetcher } },
    );
    expect(seenPolicies.length).toBeGreaterThan(0);
    expect(seenPolicies[0]?.byteBudget).toBeDefined();
    expect(seenPolicies[0]?.byteBudget?.remaining).toBe(100);
  });
});

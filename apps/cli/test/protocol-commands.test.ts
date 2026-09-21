import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  CollectionListOptions,
  ContentItem,
  ContentProcessor,
  HttpFetcher,
  ItemAdapter,
  ModelInfo,
  NormalizedDocument,
  ProgressSink,
} from '@owlieio/core';
import {
  buildProvenance,
  CancelledError,
  ExtractionError,
  JSON_PROTOCOL_SCHEMA_VERSION,
} from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const ARTICLE_URL = 'https://example.com/story';
const FEED_URL = 'https://example.com/feed.xml';

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
    stdoutJson: () => JSON.parse(stdout),
    stderrLines: () =>
      stderr
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}

function articleAdapter(progress?: ProgressSink): ItemAdapter {
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
    async extract(item: ContentItem, options) {
      options?.progress?.emit({ type: 'started', target: item.canonicalUrl });
      const document: NormalizedDocument = {
        schemaVersion: 2,
        id: item.id,
        sourceType: 'article',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'text',
        text: 'article body',
        metadata: {},
        provenance: buildProvenance({
          sourceId: item.id,
          canonicalUrl: item.canonicalUrl,
          adapterId: 'article',
          text: 'article body',
          fetchedAt: '2026-09-21T00:00:00.000Z',
        }),
      };
      options?.progress?.emit({ type: 'completed', target: item.canonicalUrl, result: document });
      progress?.emit({ type: 'started', target: item.canonicalUrl });
      return document;
    },
  };
}

function specializedAdapter(): ItemAdapter {
  return {
    ...articleAdapter(),
    id: 'youtube',
    sourceType: 'youtube',
    async resolveItem(locator) {
      return {
        id: `youtube:${locator.url}`,
        sourceType: 'youtube',
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
  };
}

function feedAdapter(entries: Array<{ url: string; title?: string }> = []): CollectionAdapter {
  return {
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
}

function fakeProcessor(): ContentProcessor {
  return {
    id: 'fake',
    async process(request) {
      return {
        output: `processed:${request.document.text}`,
        format: 'text' as const,
        metadata: { model: 'deepseek-chat' },
      };
    },
  };
}

function doctorDeps(): CliDeps {
  return {
    doctor: {
      dirWritable: async () => true,
      env: { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-chat' },
      loadFile: () => ({}),
      toolAvailable: async () => true,
    },
  };
}

function modelsDeps(models: ModelInfo[]): CliDeps {
  return {
    models: {
      env: { DEEPSEEK_API_KEY: 'sk-test' },
      readConfig: () => ({}),
      loadFile: () => ({}),
      cachePath: '/tmp/owlie-models-test.json',
      now: () => 0,
      getCatalog: () => ({
        providerId: 'deepseek',
        async listModels() {
          return models;
        },
      }),
    },
  };
}

function authDeps(): CliDeps {
  return {
    auth: {
      env: {},
      readConfig: () => ({ providers: { deepseek: { apiKey: 'sk-x' } } }),
      loadFile: () => ({}),
    },
  };
}

describe('unified JSON protocol through run()', () => {
  it('wraps doctor --json in a versioned result envelope', async () => {
    const { io, stdoutJson, stderr } = capture();
    const code = await run(['doctor', '--json'], io, doctorDeps());
    expect(code).toBe(ExitCode.Success);
    expect(stdoutJson()).toMatchObject({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'doctor',
      result: { adapters: ['youtube', 'podcast', 'rss', 'article'] },
    });
    expect(stderr()).toBe('');
  });

  it('wraps list --json in a versioned result envelope', async () => {
    const { io, stdoutJson } = capture();
    const code = await run(['list', FEED_URL, '--json'], io, {
      list: { adapter: feedAdapter([{ url: ARTICLE_URL, title: 'A story' }]) },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = stdoutJson();
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.command).toBe('list');
    expect(envelope.result.items).toHaveLength(1);
  });

  it('wraps resolve --json in a versioned result envelope without an inner schemaVersion', async () => {
    const fetcher: HttpFetcher = {
      async fetch(url) {
        return {
          url,
          contentType: 'application/json',
          text: JSON.stringify({
            results: [
              { trackId: 67890, trackName: 'Episode', episodeUrl: 'https://cdn.example.com/e.mp3' },
            ],
          }),
        };
      },
    };
    const { io, stdoutJson } = capture();
    const code = await run(
      [
        'resolve',
        'https://podcasts.apple.com/us/podcast/example/id12345?i=67890',
        '--podcast-apple',
        '--json',
      ],
      io,
      { resolve: { fetcher } },
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdoutJson()).toMatchObject({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'resolve',
      result: { resolver: 'podcast-apple', mediaUrl: 'https://cdn.example.com/e.mp3' },
    });
    expect(stdoutJson().result.schemaVersion).toBeUndefined();
  });

  it('wraps direct extract --json in a versioned result envelope and emits progress JSONL on stderr', async () => {
    const { io, stdoutJson, stderrLines } = capture();
    const code = await run(['extract', ARTICLE_URL, '--json'], io, {
      extract: { itemAdapters: [specializedAdapter()], feedAdapter: feedAdapter() },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = stdoutJson();
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.command).toBe('extract');
    expect(envelope.result.text).toBe('article body');
    const lines = stderrLines();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatchObject({ command: 'extract', kind: 'progress' });
    expect(
      lines.every(
        (line: { schemaVersion: number }) => line.schemaVersion === JSON_PROTOCOL_SCHEMA_VERSION,
      ),
    ).toBe(true);
  });

  it('always wraps feed extraction in a versioned result envelope', async () => {
    const { io, stdoutJson } = capture();
    const code = await run(['extract', FEED_URL], io, {
      extract: {
        itemAdapters: [articleAdapter()],
        feedAdapter: feedAdapter([{ url: ARTICLE_URL, title: 'A story' }]),
      },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = stdoutJson();
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.command).toBe('extract');
    expect(envelope.result.items).toHaveLength(1);
  });

  it('wraps single process --json in a versioned result envelope', async () => {
    const { io, stdoutJson } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'x', '--json'], io, {
      process: { processor: fakeProcessor() },
    });
    expect(code).toBe(ExitCode.Success);
    const envelope = stdoutJson();
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.command).toBe('process');
    expect(envelope.result.output).toBe('processed:hello');
  });

  it('wraps models --json in a versioned result envelope', async () => {
    const { io, stdoutJson } = capture();
    const code = await run(
      ['models', '--provider', 'deepseek', '--json'],
      io,
      modelsDeps([{ provider: 'deepseek', id: 'deepseek-chat' }]),
    );
    expect(code).toBe(ExitCode.Success);
    const envelope = stdoutJson();
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.command).toBe('models');
    expect(envelope.result).toEqual([{ provider: 'deepseek', id: 'deepseek-chat' }]);
  });

  it('wraps auth list --json in a versioned result envelope', async () => {
    const { io, stdoutJson } = capture();
    const code = await run(['auth', 'list', '--json'], io, authDeps());
    expect(code).toBe(ExitCode.Success);
    const envelope = stdoutJson();
    expect(envelope.schemaVersion).toBe(JSON_PROTOCOL_SCHEMA_VERSION);
    expect(envelope.command).toBe('auth');
    expect(envelope.result[0]).toMatchObject({ provider: 'deepseek', source: 'stored' });
  });

  it('adds protocol identity to process --each streaming records', async () => {
    const { io, stdout } = capture({ isTTY: true });
    const code = await run(['process', FEED_URL, '--each', '--prompt', 'x'], io, {
      process: {
        itemAdapters: [articleAdapter()],
        feedAdapter: feedAdapter([{ url: ARTICLE_URL, title: 'A story' }]),
        processor: fakeProcessor(),
      },
    });
    expect(code).toBe(ExitCode.Success);
    const records = stdout()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'process',
      item: { url: ARTICLE_URL, title: 'A story' },
    });
  });

  it('writes a versioned terminal error record for a failed --json command', async () => {
    const { io, stdout, stderrLines } = capture();
    const code = await run(['list', FEED_URL, '--json'], io, {
      list: {
        adapter: {
          ...feedAdapter(),
          async list() {
            throw new ExtractionError('feed unreadable');
          },
        },
      },
    });
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderrLines()[0]).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'list',
      kind: 'error',
      code: 'EXTRACTION_ERROR',
      message: 'feed unreadable',
    });
  });

  it('writes a versioned usage error record with empty stdout', async () => {
    const { io, stdout, stderrLines } = capture();
    const code = await run(['list', '--json'], io);
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderrLines()[0]).toMatchObject({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'list',
      kind: 'error',
      code: 'USAGE_ERROR',
    });
  });

  it('writes a versioned cancellation record through run()', async () => {
    const { io, stdout, stderrLines } = capture();
    const code = await run(['extract', ARTICLE_URL, '--json'], io, {
      extract: {
        itemAdapters: [
          {
            ...specializedAdapter(),
            async extract() {
              throw new CancelledError('extraction cancelled');
            },
          },
        ],
        feedAdapter: feedAdapter(),
      },
    });
    expect(code).toBe(ExitCode.Cancelled);
    expect(stdout()).toBe('');
    expect(stderrLines()).toEqual([
      {
        schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
        command: 'extract',
        kind: 'cancelled',
        message: 'extraction cancelled',
      },
    ]);
  });
});

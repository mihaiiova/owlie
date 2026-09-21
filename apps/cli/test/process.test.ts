import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  CollectionAdapter,
  ContentCollection,
  ContentItem,
  ContentProcessor,
  ExtractionOptions,
  ItemAdapter,
  NormalizedDocument,
  ProcessRequest,
} from '@owlieio/core';
import {
  buildProvenance,
  ConfigurationError,
  NotHandledError,
  ProcessingError,
} from '@owlieio/core';
import { ExitCode, resolveModelSelection, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

function capture(stdin: { isTTY: boolean; content?: string } = { isTTY: false, content: '' }) {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: stdin.isTTY, read: async () => stdin.content ?? '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

function makeFakeProcessor(behavior: { error?: unknown } = {}) {
  const requests: ProcessRequest[] = [];
  const processor: ContentProcessor = {
    id: 'fake',
    async process(request) {
      requests.push(request);
      if (behavior.error) throw behavior.error;
      return {
        output: `${request.instruction ?? ''}:${request.document.text}`,
        format: 'text',
        metadata: { model: 'deepseek-chat', usage: { inputTokens: 3, outputTokens: 2 } },
      };
    },
  };
  return { processor, requests };
}

function deps(partial: CliDeps['process']): CliDeps {
  return { process: partial };
}

function articleAdapter(): ItemAdapter {
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
    async extract(item: ContentItem, options?: ExtractionOptions) {
      options?.progress?.emit({ type: 'started', target: item.id });
      return {
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
    },
  };
}

function noFeedAdapter(): CollectionAdapter {
  return {
    id: 'rss',
    sourceType: 'rss',
    recognize: () => false,
    async resolve(locator) {
      return {
        id: `rss:${locator.url}`,
        sourceType: 'rss',
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
    async list(collection: ContentCollection) {
      return { collection, items: [], truncated: false };
    },
  };
}

describe('process command', () => {
  it('processes piped stdin and writes text to stdout', async () => {
    const { processor, requests } = makeFakeProcessor();
    const { io, stdout } = capture({ isTTY: false, content: 'hello world' });
    const code = await run(['process', '--prompt', 'Summarize'], io, deps({ processor }));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('Summarize:hello world\n');
    expect(requests[0]?.document.text).toBe('hello world');
  });

  it('parses a JSON NormalizedDocument with --input-format json', async () => {
    const { processor, requests } = makeFakeProcessor();
    const doc: NormalizedDocument = {
      schemaVersion: 2,
      id: 'youtube:video:abc',
      sourceType: 'youtube',
      canonicalUrl: 'https://youtube.com/watch?v=abc',
      mediaType: 'transcript',
      text: 'the transcript',
      metadata: { videoId: 'abc', isGenerated: true },
      provenance: buildProvenance({
        sourceId: 'youtube:video:abc',
        canonicalUrl: 'https://youtube.com/watch?v=abc',
        adapterId: 'youtube',
        text: 'the transcript',
        fetchedAt: '2026-09-21T00:00:00.000Z',
      }),
    };
    const { io, stdout } = capture({ isTTY: false, content: JSON.stringify(doc) });
    const code = await run(
      ['process', '--input-format', 'json', '--prompt', 'Summarize'],
      io,
      deps({ processor }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('Summarize:the transcript\n');
    expect(requests[0]?.document.id).toBe('youtube:video:abc');
    expect(requests[0]?.document.sourceType).toBe('youtube');
    expect(requests[0]?.document.metadata).toMatchObject({ videoId: 'abc' });
    expect(requests[0]?.document.provenance).toEqual(doc.provenance);
  });

  it('models piped stdin as a local document with a stable identity', async () => {
    const { processor, requests } = makeFakeProcessor();
    const { io } = capture({ isTTY: false, content: 'hello world' });
    const code = await run(['process', '--prompt', 'Summarize'], io, deps({ processor }));
    expect(code).toBe(ExitCode.Success);
    const doc = requests[0]?.document;
    expect(doc?.sourceType).toBe('local');
    expect(doc?.id).toBe('local:stdin');
    expect(doc?.canonicalUrl).toBe('');
  });

  it('models a positional text file as local content with a normalized absolute path identity', async () => {
    const { processor, requests } = makeFakeProcessor();
    const dir = mkdtempSync(join(tmpdir(), 'owlie-process-'));
    const file = join(dir, 'notes.txt');
    writeFileSync(file, 'file content', 'utf8');
    try {
      const { io } = capture({ isTTY: true });
      const code = await run(['process', file, '--prompt', 'Summarize'], io, deps({ processor }));
      expect(code).toBe(ExitCode.Success);
      const doc = requests[0]?.document;
      expect(doc?.sourceType).toBe('local');
      expect(doc?.id).toBe(`local:file:${resolve(file)}`);
      expect(doc?.provenance.sourceId).toBe(`local:file:${resolve(file)}`);
      expect(doc?.canonicalUrl).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('models --input text as local content', async () => {
    const { processor, requests } = makeFakeProcessor();
    const dir = mkdtempSync(join(tmpdir(), 'owlie-process-'));
    const file = join(dir, 'draft.md');
    writeFileSync(file, 'draft', 'utf8');
    try {
      const { io } = capture({ isTTY: true });
      const code = await run(
        ['process', '--input', file, '--prompt', 'x'],
        io,
        deps({ processor }),
      );
      expect(code).toBe(ExitCode.Success);
      expect(requests[0]?.document.sourceType).toBe('local');
      expect(requests[0]?.document.id).toBe(`local:file:${resolve(file)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a JSON document with a malformed sourceType', async () => {
    const { io, stdout, stderr } = capture({
      isTTY: false,
      content: JSON.stringify({ text: 'hi', sourceType: 'garbage' }),
    });
    const code = await run(
      ['process', '--input-format', 'json', '--prompt', 'x'],
      io,
      deps({ processor: makeFakeProcessor().processor }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('sourceType');
  });

  it('rejects a JSON document missing sourceType instead of defaulting to rss', async () => {
    const { io, stdout, stderr } = capture({
      isTTY: false,
      content: JSON.stringify({ text: 'hi' }),
    });
    const code = await run(
      ['process', '--input-format', 'json', '--prompt', 'x'],
      io,
      deps({ processor: makeFakeProcessor().processor }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('sourceType');
  });

  it('reads a positional file', async () => {
    const { processor, requests } = makeFakeProcessor();
    const dir = mkdtempSync(join(tmpdir(), 'owlie-process-'));
    const file = join(dir, 'transcript.txt');
    writeFileSync(file, 'file content', 'utf8');
    try {
      const { io, stdout } = capture({ isTTY: true });
      const code = await run(['process', file, '--prompt', 'Summarize'], io, deps({ processor }));
      expect(code).toBe(ExitCode.Success);
      expect(stdout()).toBe('Summarize:file content\n');
      expect(requests[0]?.document.text).toBe('file content');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits a JSON ProcessResult with --json', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stdout } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'Summarize', '--json'], io, deps({ processor }));
    expect(code).toBe(ExitCode.Success);
    const result = JSON.parse(stdout()).result;
    expect(result.output).toBe('Summarize:hello');
    expect(result.format).toBe('text');
    expect(result.metadata.model).toBe('deepseek-chat');
  });

  it('rejects ambiguous inputs as a usage error', async () => {
    const { io, stdout, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', 'file.txt', '--input', 'other.txt', '--prompt', 'x'],
      io,
      deps({ processor: makeFakeProcessor().processor }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('ambiguous input');
  });

  it('rejects empty stdin as a general error', async () => {
    const { io, stdout, stderr } = capture({ isTTY: false, content: '   ' });
    const code = await run(
      ['process', '--prompt', 'x'],
      io,
      deps({ processor: makeFakeProcessor().processor }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('stdin is empty');
  });

  it('rejects no input as a usage error', async () => {
    const { io, stdout, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', '--prompt', 'x'],
      io,
      deps({ processor: makeFakeProcessor().processor }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('no input');
  });

  it('errors when no model is selected', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--prompt', 'x'],
      io,
      deps({ provider: 'deepseek', config: { apiKey: 'sk-x' } }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('no model selected');
  });

  it('errors when DEEPSEEK_API_KEY is missing', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--prompt', 'x'],
      io,
      deps({ provider: 'deepseek', config: {} }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('DEEPSEEK_API_KEY');
  });

  it('reports an unknown provider before the API key check', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--provider', 'anthropic', '--prompt', 'x'],
      io,
      deps({ config: {}, readConfig: () => ({}) }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('unknown provider');
    expect(stderr()).not.toContain('API_KEY');
  });

  it('errors when no provider is selected', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--prompt', 'x'],
      io,
      deps({ config: { apiKey: 'sk-x' }, readConfig: () => ({}) }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('no provider selected');
  });

  it('accepts --provider openai and forwards it (with an injected processor)', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stdout } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--provider', 'openai', '--prompt', 'x'],
      io,
      deps({ processor }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('x:hello\n');
  });

  it('maps a processor failure to an error', async () => {
    const { processor } = makeFakeProcessor({ error: new ProcessingError('boom') });
    const { io, stdout, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'x'], io, deps({ processor }));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('boom');
  });

  it('points to owlie models when a configured default model fails', async () => {
    const { processor } = makeFakeProcessor({
      error: new ProcessingError('model not found: deepseek-chat'),
    });
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--prompt', 'x'],
      io,
      deps({ processor, provider: 'deepseek' }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('model not found');
    expect(stderr()).toContain('owlie models --provider deepseek');
  });

  it('starts and stops a progress spinner', async () => {
    const starts: string[] = [];
    let stopped = 0;
    const { processor } = makeFakeProcessor();
    const { io } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'x'], io, {
      process: {
        processor,
        spinner: {
          start: (message) => starts.push(message),
          stop: () => {
            stopped += 1;
          },
        },
      },
    });
    expect(code).toBe(ExitCode.Success);
    expect(starts).toEqual(['waiting for llm response']);
    expect(stopped).toBe(1);
  });

  it('resolves the provider from a compound --model reference', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--model', 'deepseek/deepseek-chat', '--prompt', 'x'],
      io,
      deps({ config: {}, readConfig: () => ({}) }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('DEEPSEEK_API_KEY');
    expect(stderr()).not.toContain('no provider selected');
  });

  it('errors on a conflicting --provider and compound --model', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', '--model', 'deepseek/deepseek-chat', '--provider', 'openai', '--prompt', 'x'],
      io,
      deps({ config: {}, readConfig: () => ({}) }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('conflicting');
  });

  it('writes a waiting status line before processing piped stdin', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stderr } = capture({ isTTY: false, content: 'hello world' });
    const code = await run(['process', '--prompt', 'Summarize'], io, deps({ processor }));
    expect(code).toBe(ExitCode.Success);
    expect(stderr()).toContain('waiting for llm response');
    expect(stderr()).not.toContain('owlie:');
    expect(stderr()).not.toContain('\r');
  });

  it('suppresses the waiting status line with --quiet', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stderr } = capture({ isTTY: false, content: 'hello world' });
    const code = await run(
      ['process', '--quiet', '--prompt', 'Summarize'],
      io,
      deps({ processor }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stderr()).toBe('');
  });

  it('extracts a URL and processes the extracted document', async () => {
    const { processor, requests } = makeFakeProcessor();
    const { io, stdout } = capture({ isTTY: true });
    const code = await run(
      ['process', 'https://example.com/story', '--prompt', 'Summarize'],
      io,
      deps({ processor, itemAdapters: [articleAdapter()], feedAdapter: noFeedAdapter() }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('Summarize:article body\n');
    expect(requests[0]?.document.text).toBe('article body');
    expect(requests[0]?.document.sourceType).toBe('article');
  });

  it('writes a waiting status line before processing a URL with the LLM', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', 'https://example.com/story', '--prompt', 'Summarize'],
      io,
      deps({ processor, itemAdapters: [articleAdapter()], feedAdapter: noFeedAdapter() }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stderr()).toContain('waiting for llm response');
    expect(stderr()).not.toContain('owlie:');
    expect(stderr()).not.toContain('\r');
  });

  it('extracts a URL that defers to the article adapter', async () => {
    const { processor, requests } = makeFakeProcessor();
    const podcast: ItemAdapter = {
      id: 'podcast',
      sourceType: 'podcast',
      recognize: (locator) => locator.url.startsWith('https://'),
      async resolveItem() {
        throw new NotHandledError('no podcast audio enclosure found');
      },
      async extract() {
        throw new Error('unreachable');
      },
    };
    const { io, stdout, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', 'https://example.com/story', '--prompt', 'Summarize'],
      io,
      deps({ processor, itemAdapters: [podcast, articleAdapter()], feedAdapter: noFeedAdapter() }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('Summarize:article body\n');
    expect(stderr()).toContain('extracting article text');
    expect(stderr()).not.toContain('owlie: extracting article text');
    expect(requests[0]?.document.sourceType).toBe('article');
  });

  it('fails fast on a missing provider before extracting the URL', async () => {
    let extracted = false;
    const adapter: ItemAdapter = {
      id: 'article',
      sourceType: 'article',
      recognize: () => true,
      async resolveItem() {
        extracted = true;
        throw new Error('should not resolve');
      },
      async extract() {
        extracted = true;
        throw new Error('unreachable');
      },
    };
    const { io, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', 'https://example.com/story', '--prompt', 'x'],
      io,
      deps({ itemAdapters: [adapter], feedAdapter: noFeedAdapter(), readConfig: () => ({}) }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('no provider selected');
    expect(extracted).toBe(false);
  });

  it('rejects a feed URL in single-input mode and points to --each', async () => {
    const { processor } = makeFakeProcessor();
    const feed: CollectionAdapter = {
      id: 'rss',
      sourceType: 'rss',
      recognize: (locator) => locator.url === 'https://example.com/feed.xml',
      async resolve(locator) {
        return {
          id: `rss:${locator.url}`,
          sourceType: 'rss',
          canonicalUrl: locator.url,
          metadata: {},
        };
      },
      async list(collection: ContentCollection) {
        return { collection, items: [], truncated: false };
      },
    };
    const { io, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', 'https://example.com/feed.xml', '--prompt', 'Summarize'],
      io,
      deps({ processor, feedAdapter: feed }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('--each');
  });

  it('rejects combining a URL with --input', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stderr } = capture({ isTTY: true });
    const code = await run(
      ['process', 'https://example.com/story', '--input', 'file.txt', '--prompt', 'x'],
      io,
      deps({ processor, itemAdapters: [articleAdapter()], feedAdapter: noFeedAdapter() }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('--input');
  });

  it('rejects combining a URL with piped stdin', async () => {
    const { processor } = makeFakeProcessor();
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(
      ['process', 'https://example.com/story', '--prompt', 'x'],
      io,
      deps({ processor, itemAdapters: [articleAdapter()], feedAdapter: noFeedAdapter() }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('stdin');
  });
});

describe('resolveModelSelection', () => {
  it('resolves a compound --model provider/id without consulting the fallback', () => {
    let called = false;
    const result = resolveModelSelection({ model: 'openai/gpt-4o-mini' }, () => {
      called = true;
      return 'deepseek';
    });
    expect(result).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(called).toBe(false);
  });

  it('resolves a plain --model id through the provider fallback', () => {
    expect(resolveModelSelection({ model: 'deepseek-chat' }, () => 'deepseek')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
  });

  it('errors when --provider conflicts with a compound --model provider', () => {
    expect(() =>
      resolveModelSelection(
        { model: 'deepseek/deepseek-chat', provider: 'openai' },
        () => 'deepseek',
      ),
    ).toThrow(ConfigurationError);
  });

  it('allows a matching --provider and compound --model', () => {
    expect(
      resolveModelSelection(
        { model: 'deepseek/deepseek-chat', provider: 'deepseek' },
        () => 'openai',
      ),
    ).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
  });

  it('passes through an unknown model id as-is', () => {
    expect(resolveModelSelection({ model: 'openai/gpt-7' }, () => 'deepseek')).toEqual({
      provider: 'openai',
      model: 'gpt-7',
    });
    expect(resolveModelSelection({ model: 'gpt-7' }, () => 'deepseek')).toEqual({
      provider: 'deepseek',
      model: 'gpt-7',
    });
  });

  it('forwards the hosted flag to the provider fallback', () => {
    let received: unknown;
    const result = resolveModelSelection({ model: 'deepseek-chat', hosted: true }, (opts) => {
      received = opts;
      return 'deepseek';
    });
    expect(result).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
    expect(received).toMatchObject({ hosted: true });
  });
});

import { describe, expect, it } from 'vitest';
import type {
  ContentItem,
  ContentProcessor,
  ItemAdapter,
  NormalizedDocument,
  ProcessRequest,
} from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function makeIo(stdin = '') {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    stdin: { isTTY: false, read: async () => stdin },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

function makeFakeAdapter(text = 'the transcript text'): ItemAdapter {
  return {
    id: 'fake-youtube',
    sourceType: 'youtube',
    recognize: () => true,
    async resolveItem(locator) {
      return {
        id: 'youtube:video:test',
        sourceType: 'youtube',
        canonicalUrl: locator.url,
        metadata: { videoId: 'test' },
      };
    },
    async extract(item: ContentItem, options) {
      options?.progress?.emit({ type: 'started', target: item.id });
      const document: NormalizedDocument = {
        schemaVersion: 1,
        id: item.id,
        sourceType: 'youtube',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'transcript',
        text,
        metadata: { videoId: 'test', isGenerated: false },
      };
      options?.progress?.emit({ type: 'completed', target: item.id, result: document });
      return document;
    },
  };
}

function makeFakeProcessor() {
  const requests: ProcessRequest[] = [];
  const processor: ContentProcessor = {
    id: 'fake',
    async process(request) {
      requests.push(request);
      return {
        output: `${request.instruction ?? ''}:${request.document.text.trim()}`,
        format: 'text',
        metadata: { model: 'deepseek-chat' },
      };
    },
  };
  return { processor, requests };
}

describe('extract | process pipeline', () => {
  it('pipes raw transcript text into process', async () => {
    const extractRun = makeIo();
    const extractCode = await run(['extract', URL], extractRun.io, {
      extract: { adapter: makeFakeAdapter() },
    });
    expect(extractCode).toBe(ExitCode.Success);
    // stdout carries only the transcript text (progress stays on stderr)
    expect(extractRun.stdout()).toBe('the transcript text\n');
    expect(extractRun.stderr()).toContain('extracting');

    const { processor, requests } = makeFakeProcessor();
    const processRun = makeIo(extractRun.stdout());
    const processCode = await run(['process', '--prompt', 'Summarize'], processRun.io, {
      process: { processor },
    });
    expect(processCode).toBe(ExitCode.Success);
    expect(requests[0]?.document.text).toContain('the transcript text');
    expect(processRun.stdout()).toContain('Summarize:');
  });

  it('round-trips a JSON NormalizedDocument through process', async () => {
    const extractRun = makeIo();
    const extractCode = await run(['extract', URL, '--json'], extractRun.io, {
      extract: { adapter: makeFakeAdapter() },
    });
    expect(extractCode).toBe(ExitCode.Success);
    const docJson = extractRun.stdout();
    const emitted = JSON.parse(docJson);
    expect(emitted.id).toBe('youtube:video:test');

    const { processor, requests } = makeFakeProcessor();
    const processRun = makeIo(docJson);
    const processCode = await run(
      ['process', '--input-format', 'json', '--prompt', 'Summarize', '--json'],
      processRun.io,
      { process: { processor } },
    );
    expect(processCode).toBe(ExitCode.Success);
    expect(requests[0]?.document.id).toBe('youtube:video:test');
    expect(requests[0]?.document.mediaType).toBe('transcript');
    expect(requests[0]?.document.metadata).toMatchObject({ videoId: 'test', isGenerated: false });

    const result = JSON.parse(processRun.stdout());
    expect(result.format).toBe('text');
    expect(result.metadata.model).toBe('deepseek-chat');
  });

  it('emits valid JSON at every pipeline stage', async () => {
    const extractRun = makeIo();
    await run(['extract', URL, '--json'], extractRun.io, {
      extract: { adapter: makeFakeAdapter() },
    });
    expect(() => JSON.parse(extractRun.stdout())).not.toThrow();

    const { processor } = makeFakeProcessor();
    const processRun = makeIo(extractRun.stdout());
    await run(['process', '--input-format', 'json', '--prompt', 'x', '--json'], processRun.io, {
      process: { processor },
    });
    expect(() => JSON.parse(processRun.stdout())).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { ContentItem, ItemAdapter, NormalizedDocument } from '@owlieio/core';
import { CaptionsUnavailableError } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

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

function makeFakeAdapter(
  behavior: { resolveError?: unknown; extractError?: unknown; text?: string } = {},
): ItemAdapter {
  return {
    id: 'fake-youtube',
    sourceType: 'youtube',
    recognize: () => true,
    async resolveItem(locator) {
      if (behavior.resolveError) throw behavior.resolveError;
      return {
        id: 'youtube:video:test',
        sourceType: 'youtube',
        canonicalUrl: locator.url,
        metadata: { videoId: 'test' },
      };
    },
    async extract(item: ContentItem, options) {
      options?.progress?.emit({ type: 'started', target: item.id });
      if (behavior.extractError) {
        throw behavior.extractError;
      }
      const document: NormalizedDocument = {
        schemaVersion: 1,
        id: item.id,
        sourceType: 'youtube',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'transcript',
        text: behavior.text ?? 'hello transcript',
        metadata: { videoId: 'test', isGenerated: false },
      };
      options?.progress?.emit({ type: 'completed', target: item.id, result: document });
      return document;
    },
  };
}

function deps(adapter: ItemAdapter): CliDeps {
  return { extract: { itemAdapters: [adapter] } };
}

describe('extract command', () => {
  it('writes the transcript text to stdout', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', URL], io, deps(makeFakeAdapter()));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('hello transcript\n');
    expect(stderr()).toContain('extracting youtube:video:test');
  });

  it('emits a JSON NormalizedDocument with --json', async () => {
    const { io, stdout } = capture();
    const code = await run(['extract', URL, '--json'], io, deps(makeFakeAdapter()));
    expect(code).toBe(ExitCode.Success);
    const doc = JSON.parse(stdout());
    expect(doc.text).toBe('hello transcript');
    expect(doc.mediaType).toBe('transcript');
    expect(doc.id).toBe('youtube:video:test');
  });

  it('suppresses progress with --quiet', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', URL, '--quiet'], io, deps(makeFakeAdapter()));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe('hello transcript\n');
    expect(stderr()).toBe('');
  });

  it('rejects a missing URL as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract'], io, deps(makeFakeAdapter()));
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('requires a URL');
  });

  it('rejects extra arguments as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', URL, 'extra'], io, deps(makeFakeAdapter()));
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('unexpected argument');
  });

  it('maps captions-unavailable to a clear error', async () => {
    const { io, stdout, stderr } = capture();
    const adapter = makeFakeAdapter({
      extractError: new CaptionsUnavailableError('No transcripts for this video'),
    });
    const code = await run(['extract', URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('No transcripts for this video');
  });

  it('starts and stops a progress spinner', async () => {
    const starts: string[] = [];
    let stopped = 0;
    const { io } = capture();
    const code = await run(['extract', URL], io, {
      extract: {
        itemAdapters: [makeFakeAdapter()],
        spinner: {
          start: (message) => starts.push(message),
          stop: () => {
            stopped += 1;
          },
        },
      },
    });
    expect(code).toBe(ExitCode.Success);
    expect(starts).toEqual(['extracting youtube:video:test']);
    expect(stopped).toBe(1);
  });
});

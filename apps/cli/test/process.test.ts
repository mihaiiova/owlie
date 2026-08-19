import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContentProcessor, NormalizedDocument, ProcessRequest } from '@owlieio/core';
import { ProcessingError } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

function capture(stdin: { isTTY: boolean; content?: string } = { isTTY: false, content: '' }) {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
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
      schemaVersion: 1,
      id: 'youtube:video:abc',
      sourceType: 'youtube',
      canonicalUrl: 'https://youtube.com/watch?v=abc',
      mediaType: 'transcript',
      text: 'the transcript',
      metadata: { videoId: 'abc', isGenerated: true },
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
    expect(requests[0]?.document.metadata).toMatchObject({ videoId: 'abc' });
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
    const result = JSON.parse(stdout());
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
    const code = await run(['process', '--prompt', 'x'], io, deps({ config: { apiKey: 'sk-x' } }));
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('no model selected');
  });

  it('errors when DEEPSEEK_API_KEY is missing', async () => {
    const { io, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'x'], io, deps({ config: {} }));
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('DEEPSEEK_API_KEY');
  });

  it('maps a processor failure to an error', async () => {
    const { processor } = makeFakeProcessor({ error: new ProcessingError('boom') });
    const { io, stdout, stderr } = capture({ isTTY: false, content: 'hello' });
    const code = await run(['process', '--prompt', 'x'], io, deps({ processor }));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('boom');
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
    expect(starts).toEqual(['processing']);
    expect(stopped).toBe(1);
  });
});

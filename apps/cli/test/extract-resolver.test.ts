import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { HttpFetcher, Transcriber } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const APPLE_URL = 'https://podcasts.apple.com/us/podcast/example/id12345?i=67890';
const MEDIA_URL = 'https://cdn.example.com/episode.mp3';

const cacheDir = join(tmpdir(), `owlie-extract-resolver-${process.pid}`);

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

function appleFetcher(mediaUrl = MEDIA_URL): HttpFetcher {
  return {
    async fetch(url) {
      return {
        url,
        contentType: 'application/json',
        text: JSON.stringify({
          results: [{ trackId: 67890, trackName: 'Episode', episodeUrl: mediaUrl }],
        }),
      };
    },
    async fetchToFile(url, path) {
      await writeFile(path, Buffer.from([0, 1]));
      return { url, contentType: 'audio/mpeg', bytes: 2 };
    },
  };
}

const transcriber: Transcriber = {
  id: 'fake',
  async transcribe(input) {
    return { text: `transcript of ${input.mediaUrl}`, language: 'en', metadata: { fake: true } };
  },
};

function deps(fetcher: HttpFetcher = appleFetcher()) {
  return { extract: { fetcher, transcriber, cacheDir } };
}

afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe('extract resolver-selection flags', () => {
  it('runs resolve → download → transcribe for --podcast-apple', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', APPLE_URL, '--podcast-apple'], io, deps());
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe(`transcript of ${MEDIA_URL}\n`);
    expect(stderr()).toContain('extracting');
  });

  it('emits a JSON document with --json', async () => {
    const { io, stdout } = capture();
    const code = await run(['extract', APPLE_URL, '--podcast-apple', '--json'], io, deps());
    expect(code).toBe(ExitCode.Success);
    const doc = JSON.parse(stdout()).result;
    expect(doc.canonicalUrl).toBe(MEDIA_URL);
    expect(doc.mediaType).toBe('transcript');
    expect(doc.metadata).toMatchObject({ title: 'Episode', resolvedFrom: 'apple', fake: true });
  });

  it('transcribes a direct media URL with --podcast-media without resolving a page', async () => {
    const mediaFetcher: HttpFetcher = {
      async fetch() {
        throw new Error('direct media resolver must not fetch');
      },
      async fetchToFile(url, path) {
        await writeFile(path, Buffer.from([0, 1]));
        return { url, contentType: 'audio/mpeg', bytes: 2 };
      },
    };
    const { io, stdout } = capture();
    const code = await run(['extract', MEDIA_URL, '--podcast-media'], io, {
      extract: { fetcher: mediaFetcher, transcriber, cacheDir },
    });
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe(`transcript of ${MEDIA_URL}\n`);
  });

  it('passes --max-media-bytes to the direct-media download seam', async () => {
    let maxResponseBytes: number | undefined;
    const mediaFetcher: HttpFetcher = {
      async fetch() {
        throw new Error('direct media resolver must not fetch');
      },
      async fetchToFile(url, path, options) {
        maxResponseBytes = options?.policy?.maxResponseBytes;
        await writeFile(path, Buffer.from([0, 1]));
        return { url, contentType: 'audio/mpeg', bytes: 2 };
      },
    };
    const { io, stdout } = capture();
    const code = await run(
      ['extract', MEDIA_URL, '--podcast-media', '--max-media-bytes', '123'],
      io,
      { extract: { fetcher: mediaFetcher, transcriber, cacheDir } },
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe(`transcript of ${MEDIA_URL}\n`);
    expect(maxResponseBytes).toBe(123);
  });

  it('rejects an incompatible resolver flag as a usage error (no article fallback)', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['extract', 'https://example.com/article', '--podcast-apple'],
      io,
      deps(),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('--podcast-apple');
  });

  it('fails clearly rather than producing article text when --podcast-page finds no enclosure', async () => {
    const pageFetcher: HttpFetcher = {
      async fetch(url) {
        return { url, contentType: 'text/html', text: '<html><body>no audio</body></html>' };
      },
      async fetchToFile() {
        throw new Error('should not download');
      },
    };
    const { io, stdout, stderr } = capture();
    const code = await run(['extract', 'https://example.com/story', '--podcast-page'], io, {
      extract: { fetcher: pageFetcher, transcriber, cacheDir },
    });
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('no podcast audio enclosure');
  });

  it('surfaces chunk progress through the spinner', async () => {
    const updatingTranscriber: Transcriber = {
      id: 'fake-progress',
      async transcribe(input, options) {
        options?.progress?.emit({
          type: 'progress',
          target: input.mediaUrl ?? '',
          current: 1,
          total: 2,
          message: 'transcribing chunk 1/2',
        });
        return { text: 'done', language: 'en', metadata: {} };
      },
    };
    const updates: string[] = [];
    const { io } = capture();
    const code = await run(['extract', APPLE_URL, '--podcast-apple'], io, {
      extract: {
        fetcher: appleFetcher(),
        transcriber: updatingTranscriber,
        cacheDir,
        spinner: {
          start: () => {},
          update: (message) => updates.push(message),
          stop: () => {},
        },
      },
    });
    expect(code).toBe(ExitCode.Success);
    expect(updates).toContain('transcribing chunk 1/2');
  });

  it('rejects multiple resolver flags as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['extract', APPLE_URL, '--podcast-apple', '--podcast-media'],
      io,
      deps(),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('cannot combine resolver flags');
  });
});

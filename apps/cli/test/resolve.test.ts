import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliIo } from 'owlie';

const APPLE_URL = 'https://podcasts.apple.com/us/podcast/example/id12345?i=67890';
const MEDIA_URL = 'https://cdn.example.com/episode.mp3';

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

function appleFetcher(): HttpFetcher {
  return {
    async fetch(url) {
      return {
        url,
        contentType: 'application/json',
        text: JSON.stringify({
          results: [{ trackId: 67890, trackName: 'Episode', episodeUrl: MEDIA_URL }],
        }),
      };
    },
  };
}

function deps(fetcher: HttpFetcher): { resolve: { fetcher: HttpFetcher } } {
  return { resolve: { fetcher } };
}

describe('resolve command', () => {
  it('prints the validated media URL with no resolver flag', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['resolve', APPLE_URL], io, deps(appleFetcher()));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe(`${MEDIA_URL}\n`);
    expect(stderr()).toBe('');
  });

  it('prints the validated media URL with an explicit resolver flag', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['resolve', APPLE_URL, '--podcast-apple'], io, deps(appleFetcher()));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe(`${MEDIA_URL}\n`);
    expect(stderr()).toBe('');
  });

  it('emits a stable JSON envelope with --json', async () => {
    const { io, stdout } = capture();
    const code = await run(
      ['resolve', APPLE_URL, '--podcast-apple', '--json'],
      io,
      deps(appleFetcher()),
    );
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout());
    expect(envelope).toEqual({
      schemaVersion: 1,
      resolver: 'podcast-apple',
      mediaUrl: MEDIA_URL,
      metadata: { title: 'Episode', resolvedFrom: 'apple' },
    });
  });

  it('returns a usage error for an incompatible resolver flag', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['resolve', 'https://example.com/article', '--podcast-apple'],
      io,
      deps(appleFetcher()),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('--podcast-apple');
  });

  it('rejects a missing URL as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['resolve'], io, deps(appleFetcher()));
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('requires a URL');
  });

  it('rejects extra arguments as a usage error', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['resolve', APPLE_URL, 'extra'], io, deps(appleFetcher()));
    expect(code).toBe(ExitCode.Usage);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('unexpected argument');
  });

  it('fails clearly when a generic page has no audio enclosure (no article fallback)', async () => {
    const fetcher: HttpFetcher = {
      async fetch(url) {
        return { url, contentType: 'text/html', text: '<html><body>no audio</body></html>' };
      },
    };
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['resolve', 'https://example.com/story', '--podcast-page'],
      io,
      deps(fetcher),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('no podcast audio enclosure');
  });

  it('fails safely when a page declares an unsafe media URL', async () => {
    const fetcher: HttpFetcher = {
      async fetch(url) {
        return {
          url,
          contentType: 'text/html',
          text: '<audio src="http://localhost/audio.mp3"></audio>',
        };
      },
    };
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['resolve', 'https://example.com/story', '--podcast-page'],
      io,
      deps(fetcher),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('localhost');
  });

  it('never downloads or transcribes media', async () => {
    const downloads: string[] = [];
    const fetcher: HttpFetcher = {
      async fetch(url) {
        return {
          url,
          contentType: 'application/json',
          text: JSON.stringify({
            results: [{ trackId: 67890, trackName: 'Episode', episodeUrl: MEDIA_URL }],
          }),
        };
      },
      async fetchToFile(url) {
        downloads.push(url);
        return { url, contentType: 'audio/mpeg', bytes: 3 };
      },
    };
    const { io, stdout } = capture();
    const code = await run(['resolve', APPLE_URL, '--podcast-apple'], io, deps(fetcher));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toBe(`${MEDIA_URL}\n`);
    expect(downloads).toEqual([]);
  });
});

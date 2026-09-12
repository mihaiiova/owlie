import { readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { PodcastAdapter } from '@owlieio/adapter-podcast';
import { FakeTranscriber } from '@owlieio/testing';
import { itemAdapterContract } from '@owlieio/testing/contract-tests';

const url = 'https://cdn.example.com/episode.mp3';

const cacheDir = join(tmpdir(), `owlie-podcast-${process.pid}`);

function fakeFetcher(downloads: string[]): HttpFetcher {
  return {
    async fetchToFile(mediaUrl, path) {
      downloads.push(mediaUrl);
      await writeFile(path, Buffer.from([0, 255, 1]));
      return { url: mediaUrl, contentType: 'audio/mpeg', bytes: 3 };
    },
    async fetch(mediaUrl) {
      return { url: mediaUrl, contentType: 'text/plain', text: '' };
    },
    async fetchText() {
      return '';
    },
  };
}

function makeAdapter(): PodcastAdapter {
  return new PodcastAdapter({
    fetcher: fakeFetcher([]),
    transcriber: new FakeTranscriber(),
    cacheDir,
  });
}

afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe('PodcastAdapter extraction', () => {
  it('downloads through the binary seam and returns a timed podcast transcript', async () => {
    const downloads: string[] = [];
    const adapter = new PodcastAdapter({
      fetcher: fakeFetcher(downloads),
      transcriber: new FakeTranscriber(),
      cacheDir,
    });
    const item = await adapter.resolveItem({ url });
    const document = await adapter.extract(item);
    expect(downloads).toEqual([url]);
    expect(document).toMatchObject({
      id: `podcast:episode:${url}`,
      sourceType: 'podcast',
      mediaType: 'transcript',
      text: `transcript of ${url}`,
      metadata: { fake: true, language: 'en' },
    });
    await expect(readdir(cacheDir)).resolves.toEqual([]);
  });
});

itemAdapterContract('podcast', makeAdapter, { url });

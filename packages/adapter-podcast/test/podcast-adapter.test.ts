import { readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TranscriptionError } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';
import {
  ApplePodcastsResolver,
  GenericEpisodePageResolver,
  PodcastAdapter,
} from '@owlieio/adapter-podcast';
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
  it('resolves an Apple episode then downloads and transcribes its media', async () => {
    const downloads: string[] = [];
    const fetcher = fakeFetcher(downloads);
    fetcher.fetch = async (lookupUrl) => ({
      url: lookupUrl,
      contentType: 'application/json',
      text: JSON.stringify({
        results: [{ trackId: 67890, trackName: 'Apple episode', episodeUrl: url }],
      }),
    });
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber: new FakeTranscriber(),
      cacheDir,
      resolvers: [new ApplePodcastsResolver({ fetcher })],
    });

    const item = await adapter.resolveItem({
      url: 'https://podcasts.apple.com/us/podcast/example/id12345?i=67890',
    });
    const document = await adapter.extract(item);

    expect(downloads).toEqual([url]);
    expect(document).toMatchObject({
      canonicalUrl: url,
      metadata: { title: 'Apple episode', resolvedFrom: 'apple', fake: true },
    });
  });

  it('resolves a page enclosure, then downloads and transcribes the resolved media URL', async () => {
    const downloads: string[] = [];
    const fetcher = fakeFetcher(downloads);
    fetcher.fetch = async (pageUrl) => ({
      url: pageUrl,
      contentType: 'text/html',
      text: '<audio src="/audio/episode.mp3"></audio>',
    });
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber: new FakeTranscriber(),
      cacheDir,
      resolvers: [new GenericEpisodePageResolver({ fetcher })],
    });

    const item = await adapter.resolveItem({ url: 'https://publisher.example/episodes/one' });
    const document = await adapter.extract(item);

    expect(downloads).toEqual(['https://publisher.example/audio/episode.mp3']);
    expect(document).toMatchObject({
      canonicalUrl: 'https://publisher.example/audio/episode.mp3',
      metadata: { resolvedFrom: 'page', fake: true },
    });
  });

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

  it('maps unreadable downloaded media to extraction failure and removes the work directory', async () => {
    const adapter = new PodcastAdapter({
      fetcher: fakeFetcher([]),
      transcriber: {
        id: 'failing-transcriber',
        async transcribe() {
          throw new TranscriptionError('ffprobe determined media is not readable audio');
        },
      },
      cacheDir,
    });
    const item = await adapter.resolveItem({ url });

    await expect(adapter.extract(item)).rejects.toThrow('podcast extraction failed');
    await expect(readdir(cacheDir)).resolves.toEqual([]);
  });

  it('keeps the safe default byte cap when no caller override is supplied', async () => {
    let maxResponseBytes: number | undefined;
    const fetcher = fakeFetcher([]);
    const originalFetchToFile = fetcher.fetchToFile!;
    fetcher.fetchToFile = async (mediaUrl, path, options) => {
      maxResponseBytes = options?.policy?.maxResponseBytes;
      return originalFetchToFile(mediaUrl, path, options);
    };
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber: new FakeTranscriber(),
      cacheDir,
    });

    const item = await adapter.resolveItem({ url });
    await adapter.extract(item);

    expect(maxResponseBytes).toBe(512 * 1024 * 1024);
  });

  it('applies a caller-provided byte cap to the media download', async () => {
    let maxResponseBytes: number | undefined;
    const fetcher = fakeFetcher([]);
    const originalFetchToFile = fetcher.fetchToFile!;
    fetcher.fetchToFile = async (mediaUrl, path, options) => {
      maxResponseBytes = options?.policy?.maxResponseBytes;
      return originalFetchToFile(mediaUrl, path, options);
    };
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber: new FakeTranscriber(),
      cacheDir,
      mediaFetchPolicy: { maxResponseBytes: 42 },
    });

    const item = await adapter.resolveItem({ url });
    await adapter.extract(item);

    expect(maxResponseBytes).toBe(42);
  });

  it('passes a cancellation signal through resolveItem to the page resolver', async () => {
    const fetcher = fakeFetcher([]);
    fetcher.fetch = async (pageUrl) => ({
      url: pageUrl,
      contentType: 'text/html',
      text: '<audio src="/audio/episode.mp3"></audio>',
    });
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber: new FakeTranscriber(),
      cacheDir,
      resolvers: [new GenericEpisodePageResolver({ fetcher })],
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.resolveItem(
        { url: 'https://publisher.example/episodes/one' },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('podcast episode resolution cancelled');
  });
});

itemAdapterContract('podcast', makeAdapter, { url });

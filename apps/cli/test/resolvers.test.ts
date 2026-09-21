import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { ValidationError } from '@owlieio/core';
import type { PodcastAudioResolver } from '@owlieio/adapter-podcast';
import {
  PODCAST_RESOLVER_REGISTRY,
  createPodcastResolvers,
  resolvePodcastAudio,
  resolverFlagForName,
  resolverNameForFlag,
} from 'owlie';

const APPLE_URL = 'https://podcasts.apple.com/us/podcast/example/id12345?i=67890';

function fakeFetcher(text: string, contentType = 'text/html'): HttpFetcher {
  return {
    async fetch(url) {
      return { url, contentType, text };
    },
  };
}

describe('PODCAST_RESOLVER_REGISTRY', () => {
  it('registers podcast-media, podcast-apple, and podcast-page with their flags', () => {
    expect(PODCAST_RESOLVER_REGISTRY.map((entry) => entry.name)).toEqual([
      'podcast-media',
      'podcast-apple',
      'podcast-page',
    ]);
    expect(PODCAST_RESOLVER_REGISTRY.map((entry) => entry.flag)).toEqual([
      '--podcast-media',
      '--podcast-apple',
      '--podcast-page',
    ]);
  });
});

describe('resolverNameForFlag / resolverFlagForName', () => {
  it('maps each flag to its stable name and back', () => {
    expect(resolverNameForFlag('--podcast-apple')).toBe('podcast-apple');
    expect(resolverNameForFlag('--podcast-media')).toBe('podcast-media');
    expect(resolverNameForFlag('--podcast-page')).toBe('podcast-page');
    expect(resolverFlagForName('podcast-apple')).toBe('--podcast-apple');
    expect(resolverFlagForName('podcast-shopify')).toBeUndefined();
    expect(resolverNameForFlag('--podcast-shopify')).toBeUndefined();
  });
});

describe('createPodcastResolvers', () => {
  it('builds resolver instances that recognize their own URLs in registration order', () => {
    const resolvers = createPodcastResolvers(fakeFetcher(''));
    expect(resolvers[0]?.recognize({ url: 'https://cdn.example.com/episode.mp3' })).toBe(true);
    expect(resolvers[1]?.recognize({ url: APPLE_URL })).toBe(true);
    expect(resolvers[2]?.recognize({ url: 'https://publisher.example/episodes/one' })).toBe(true);
  });
});

describe('resolvePodcastAudio', () => {
  it('resolves an Apple episode automatically and reports the matched resolver name', async () => {
    const fetcher = fakeFetcher(
      JSON.stringify({
        results: [
          { trackId: 67890, trackName: 'Episode', episodeUrl: 'https://cdn.example.com/a.mp3' },
        ],
      }),
      'application/json',
    );
    const result = await resolvePodcastAudio(APPLE_URL, { fetcher });
    expect(result).toEqual({
      resolver: 'podcast-apple',
      mediaUrl: 'https://cdn.example.com/a.mp3',
      metadata: { title: 'Episode', resolvedFrom: 'apple' },
    });
  });

  it('resolves a direct media URL through the podcast-media resolver', async () => {
    const result = await resolvePodcastAudio('https://cdn.example.com/episode.mp3', {
      fetcher: fakeFetcher(''),
    });
    expect(result).toEqual({
      resolver: 'podcast-media',
      mediaUrl: 'https://cdn.example.com/episode.mp3',
      metadata: undefined,
    });
  });

  it('resolves a page enclosure through the podcast-page resolver', async () => {
    const fetcher = fakeFetcher('<audio src="/audio/episode.mp3"></audio>');
    const result = await resolvePodcastAudio('https://publisher.example/episodes/one', { fetcher });
    expect(result).toEqual({
      resolver: 'podcast-page',
      mediaUrl: 'https://publisher.example/audio/episode.mp3',
      metadata: { resolvedFrom: 'page' },
    });
  });

  it('errors clearly when an explicit resolver does not recognize the URL', async () => {
    await expect(
      resolvePodcastAudio('https://example.com/article', {
        fetcher: fakeFetcher(''),
        resolverName: 'podcast-apple',
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      resolvePodcastAudio('https://example.com/article', {
        fetcher: fakeFetcher(''),
        resolverName: 'podcast-apple',
      }),
    ).rejects.toThrow('resolver "--podcast-apple" does not recognize URL');
  });

  it('errors clearly when no resolver recognizes the URL', async () => {
    await expect(
      resolvePodcastAudio('ftp://example.com/episode.mp3', { fetcher: fakeFetcher('') }),
    ).rejects.toThrow('no podcast resolver recognizes URL');
  });

  it('errors on an unknown resolver name', async () => {
    await expect(
      resolvePodcastAudio('https://example.com/x', {
        fetcher: fakeFetcher(''),
        resolverName: 'podcast-shopify',
      }),
    ).rejects.toThrow('unknown resolver "podcast-shopify"');
  });

  it('resolves a future audio source registered by name without changing dispatch', async () => {
    const shopify: PodcastAudioResolver = {
      recognize: (locator) => locator.url.includes('shopify'),
      async resolve() {
        return {
          mediaUrl: 'https://cdn.shopify.com/episode.mp3',
          metadata: { resolvedFrom: 'shopify' },
        };
      },
    };
    const result = await resolvePodcastAudio('https://podcasts.shopify.com/x', {
      fetcher: fakeFetcher(''),
      registry: [{ name: 'podcast-shopify', flag: '--podcast-shopify', create: () => shopify }],
      resolverName: 'podcast-shopify',
    });
    expect(result).toEqual({
      resolver: 'podcast-shopify',
      mediaUrl: 'https://cdn.shopify.com/episode.mp3',
      metadata: { resolvedFrom: 'shopify' },
    });
  });
});

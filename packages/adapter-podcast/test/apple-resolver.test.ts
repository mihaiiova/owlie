import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { ApplePodcastsResolver, parseAppleEpisodeUrl } from '@owlieio/adapter-podcast';

function fetcher(responses: Record<string, string>): HttpFetcher {
  return {
    async fetch(url) {
      const text = responses[url];
      if (text === undefined) throw new Error(`unexpected URL: ${url}`);
      return {
        url,
        contentType: url.includes('itunes.apple.com/lookup')
          ? 'application/json'
          : 'application/xml',
        text,
      };
    },
  };
}

describe('parseAppleEpisodeUrl', () => {
  it('normalizes a regional Apple episode URL without network access', () => {
    expect(
      parseAppleEpisodeUrl('https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890'),
    ).toEqual({ country: 'gb', podcastId: '12345', episodeId: '67890' });
  });

  it('rejects Apple podcast URLs without an episode id and non-Apple URLs', () => {
    expect(
      parseAppleEpisodeUrl('https://podcasts.apple.com/us/podcast/example/id12345'),
    ).toBeUndefined();
    expect(
      parseAppleEpisodeUrl('https://example.com/us/podcast/example/id12345?i=67890'),
    ).toBeUndefined();
  });

  it('rejects an Apple episode URL whose path lacks a two-letter country code', () => {
    expect(
      parseAppleEpisodeUrl('https://podcasts.apple.com/podcast/example/id12345?i=67890'),
    ).toBeUndefined();
  });
});

describe('ApplePodcastsResolver', () => {
  it('uses the structured lookup result for the requested episode', async () => {
    const lookup = 'https://itunes.apple.com/lookup?id=12345&entity=podcastEpisode&country=gb';
    const resolver = new ApplePodcastsResolver({
      fetcher: fetcher({
        [lookup]: JSON.stringify({
          results: [
            {
              wrapperType: 'podcastEpisode',
              trackId: 67890,
              trackName: 'The episode',
              episodeUrl: 'https://cdn.example.com/episode.mp3',
            },
          ],
        }),
      }),
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).resolves.toEqual({
      mediaUrl: 'https://cdn.example.com/episode.mp3',
      metadata: { title: 'The episode', resolvedFrom: 'apple' },
    });
  });

  it('accepts Apple lookup responses served as text/javascript', async () => {
    const resolver = new ApplePodcastsResolver({
      fetcher: {
        async fetch(url) {
          return {
            url,
            contentType: 'text/javascript; charset=utf-8',
            text: JSON.stringify({
              results: [
                {
                  wrapperType: 'podcastEpisode',
                  trackId: 67890,
                  trackName: 'The episode',
                  episodeUrl: 'https://cdn.example.com/episode.mp3',
                },
              ],
            }),
          };
        },
      },
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).resolves.toEqual({
      mediaUrl: 'https://cdn.example.com/episode.mp3',
      metadata: { title: 'The episode', resolvedFrom: 'apple' },
    });
  });

  it('falls back to the matching RSS enclosure when lookup has no episode URL', async () => {
    const lookup = 'https://itunes.apple.com/lookup?id=12345&entity=podcastEpisode&country=gb';
    const resolver = new ApplePodcastsResolver({
      fetcher: fetcher({
        [lookup]: JSON.stringify({
          results: [
            {
              wrapperType: 'podcastEpisode',
              trackId: 67890,
              trackName: 'Fallback episode',
              episodeGuid: 'https://publisher.example/episodes/67890',
            },
            { wrapperType: 'collection', feedUrl: 'https://publisher.example/feed.xml' },
          ],
        }),
        'https://publisher.example/feed.xml': `
          <rss><channel><item><guid>https://publisher.example/episodes/67890</guid>
          <title>Fallback episode</title><enclosure url="/audio/episode.m4a" /></item></channel></rss>`,
      }),
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).resolves.toEqual({
      mediaUrl: 'https://publisher.example/audio/episode.m4a',
      metadata: { title: 'Fallback episode', resolvedFrom: 'apple' },
    });
  });

  it('rejects an RSS fallback containing a DTD', async () => {
    const lookup = 'https://itunes.apple.com/lookup?id=12345&entity=podcastEpisode&country=gb';
    const resolver = new ApplePodcastsResolver({
      fetcher: fetcher({
        [lookup]: JSON.stringify({
          results: [
            {
              wrapperType: 'podcastEpisode',
              trackId: 67890,
              episodeGuid: 'https://publisher.example/episodes/67890',
            },
            { wrapperType: 'collection', feedUrl: 'https://publisher.example/feed.xml' },
          ],
        }),
        'https://publisher.example/feed.xml': `<!DOCTYPE rss [<!ENTITY xxe "unsafe">]>
          <rss><channel><item><guid>https://publisher.example/episodes/67890</guid>
          <enclosure url="https://cdn.example.com/episode.mp3" /></item></channel></rss>`,
      }),
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).rejects.toThrow('DTD or entity declaration');
  });

  it('rejects a lookup response that is not JSON', async () => {
    const resolver = new ApplePodcastsResolver({
      fetcher: {
        async fetch(url) {
          return { url, contentType: 'text/html', text: '<html></html>' };
        },
      },
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).rejects.toThrow('unexpected lookup response content type');
  });

  it('throws when no episode enclosure can be resolved', async () => {
    const lookup = 'https://itunes.apple.com/lookup?id=12345&entity=podcastEpisode&country=gb';
    const resolver = new ApplePodcastsResolver({
      fetcher: fetcher({ [lookup]: JSON.stringify({ results: [] }) }),
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).rejects.toThrow('no audio enclosure found for Apple Podcasts episode 67890');
  });
});

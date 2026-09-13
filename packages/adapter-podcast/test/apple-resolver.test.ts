import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { ApplePodcastsResolver, parseAppleEpisodeUrl } from '@owlieio/adapter-podcast';

function fetcher(responses: Record<string, string>): HttpFetcher {
  return {
    async fetch(url) {
      const text = responses[url];
      if (text === undefined) throw new Error(`unexpected URL: ${url}`);
      return { url, contentType: 'application/json', text };
    },
    async fetchText(url) {
      return (await this.fetch(url)).text;
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
});

describe('ApplePodcastsResolver', () => {
  it('uses the structured lookup result for the requested episode', async () => {
    const lookup = 'https://itunes.apple.com/lookup?id=12345&entity=podcastEpisode&country=gb';
    const resolver = new ApplePodcastsResolver({
      fetcher: fetcher({
        [lookup]: JSON.stringify({
          results: [
            {
              wrapperType: 'track',
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

  it('falls back to the matching RSS enclosure when lookup has no episode URL', async () => {
    const lookup = 'https://itunes.apple.com/lookup?id=12345&entity=podcastEpisode&country=gb';
    const resolver = new ApplePodcastsResolver({
      fetcher: fetcher({
        [lookup]: JSON.stringify({ results: [{ feedUrl: 'https://publisher.example/feed.xml' }] }),
        'https://publisher.example/feed.xml': `
          <rss><channel><item><itunes:episode>67890</itunes:episode>
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
        [lookup]: JSON.stringify({ results: [{ feedUrl: 'https://publisher.example/feed.xml' }] }),
        'https://publisher.example/feed.xml': `<!DOCTYPE rss [<!ENTITY xxe "unsafe">]>
          <rss><channel><item><itunes:episode>67890</itunes:episode>
          <enclosure url="https://cdn.example.com/episode.mp3" /></item></channel></rss>`,
      }),
    });

    await expect(
      resolver.resolve({
        url: 'https://podcasts.apple.com/gb/podcast/example-show/id12345?i=67890',
      }),
    ).rejects.toThrow('DTD or entity declaration');
  });
});

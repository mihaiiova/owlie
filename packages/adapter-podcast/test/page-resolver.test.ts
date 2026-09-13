import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { GenericEpisodePageResolver } from '@owlieio/adapter-podcast';

type FetchResponse = { contentType?: string; text: string };

function pageFetcher(html: string, responses: Record<string, FetchResponse> = {}): HttpFetcher {
  return {
    async fetch(url) {
      const response = responses[url];
      return {
        url,
        contentType: response?.contentType ?? 'text/html',
        text: response?.text ?? html,
      };
    },
    async fetchText(url) {
      return (await this.fetch(url)).text;
    },
  };
}

describe('GenericEpisodePageResolver', () => {
  it('resolves JSON-LD audio before lower-priority page signals', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher(`
        <script type="application/ld+json">
          {"@type":"PodcastEpisode","name":"Episode title","associatedMedia":{"@type":"AudioObject","contentUrl":"/audio/episode.mp3"}}
        </script>
        <audio src="/fallback.mp3"></audio>
      `),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).resolves.toEqual({
      mediaUrl: 'https://publisher.example/audio/episode.mp3',
      metadata: { title: 'Episode title', resolvedFrom: 'page' },
    });
  });

  it('ignores a JSON-LD candidate that points back at the page itself', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher(`
        <script type="application/ld+json">
          {"@type":"PodcastEpisode","name":"Episode","url":"/episodes/one","associatedMedia":{"@type":"AudioObject","contentUrl":"/audio/episode.mp3"}}
        </script>
      `),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).resolves.toEqual({
      mediaUrl: 'https://publisher.example/audio/episode.mp3',
      metadata: { title: 'Episode', resolvedFrom: 'page' },
    });
  });

  it('resolves a relative audio element when no structured metadata exists', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<audio><source src="media/episode.m4a"></audio>'),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one/' }),
    ).resolves.toEqual({
      mediaUrl: 'https://publisher.example/episodes/one/media/episode.m4a',
      metadata: { resolvedFrom: 'page' },
    });
  });

  it('follows a declared oEmbed endpoint to find audio', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<link type="application/json+oembed" href="/oembed?episode=one">', {
        'https://publisher.example/oembed?episode=one': {
          contentType: 'application/json',
          text: '{"type":"audio","url":"https://cdn.example.com/episode.ogg","title":"oEmbed episode"}',
        },
      }),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).resolves.toEqual({
      mediaUrl: 'https://cdn.example.com/episode.ogg',
      metadata: { title: 'oEmbed episode', resolvedFrom: 'page' },
    });
  });

  it('rejects a non-audio oEmbed type and falls through to lower-priority signals', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher(
        '<link type="application/json+oembed" href="/oembed?episode=one"><audio src="/audio/episode.mp3"></audio>',
        {
          'https://publisher.example/oembed?episode=one': {
            contentType: 'application/json',
            text: '{"type":"link","url":"https://publisher.example/episodes/one"}',
          },
        },
      ),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).resolves.toEqual({
      mediaUrl: 'https://publisher.example/audio/episode.mp3',
      metadata: { resolvedFrom: 'page' },
    });
  });

  it('follows an alternate feed and resolves its enclosure', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<link rel="alternate" type="application/rss+xml" href="/feed.xml">', {
        'https://publisher.example/feed.xml': {
          contentType: 'application/rss+xml',
          text: '<rss><channel><item><enclosure url="https://cdn.example.com/episode.mp3" /></item></channel></rss>',
        },
      }),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).resolves.toEqual({
      mediaUrl: 'https://cdn.example.com/episode.mp3',
      metadata: { resolvedFrom: 'page' },
    });
  });

  it('reports a clear diagnostic when the page has no declarative audio', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<article>No audio here</article>'),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toThrow('no podcast audio enclosure found');
  });

  it('declines a page whose content type is not HTML', async () => {
    const fetcher = pageFetcher(''); // unused body
    fetcher.fetch = async (url) => ({ url, contentType: 'application/pdf', text: '' });
    const resolver = new GenericEpisodePageResolver({ fetcher });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toThrow('unsupported content type');
  });

  it('rejects an unsafe media URL discovered on an otherwise safe page', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<audio src="http://127.0.0.1/private.mp3">'),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toThrow('refusing to fetch a disallowed host');
  });

  it('honors cancellation before a page fetch begins', async () => {
    const controller = new AbortController();
    controller.abort();
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<audio src="episode.mp3">'),
    });

    await expect(
      resolver.resolve(
        { url: 'https://publisher.example/episodes/one' },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('podcast episode resolution cancelled');
  });
});

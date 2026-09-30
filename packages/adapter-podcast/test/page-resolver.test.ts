import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { NotHandledError } from '@owlieio/core';
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
          text:
            '<rss version="2.0"><channel><title>Show</title>' +
            '<item><title>Other</title><link>https://publisher.example/episodes/two</link><enclosure url="https://cdn.example.com/two.mp3" type="audio/mpeg" /></item>' +
            '<item><title>One</title><link>https://publisher.example/episodes/one/</link><enclosure url="https://cdn.example.com/episode.mp3" /></item>' +
            '</channel></rss>',
        },
      }),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).resolves.toEqual({
      mediaUrl: 'https://cdn.example.com/episode.mp3',
      metadata: { title: 'One', resolvedFrom: 'page' },
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

  it('attaches the already-fetched page to the no-audio deferral', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<article>No audio here</article>'),
    });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(NotHandledError);
      expect((error as NotHandledError).deferredResponse).toMatchObject({
        url: 'https://publisher.example/episodes/one',
        contentType: 'text/html',
        text: '<article>No audio here</article>',
      });
      return true;
    });
  });

  it('declines a page whose content type is not HTML', async () => {
    const fetcher = pageFetcher(''); // unused body
    fetcher.fetch = async (url) => ({ url, contentType: 'application/pdf', text: '' });
    const resolver = new GenericEpisodePageResolver({ fetcher });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toThrow('unsupported content type');
  });

  it('declines a page with no declared content type', async () => {
    const fetcher = pageFetcher('');
    fetcher.fetch = async (url) => ({
      url,
      contentType: null,
      text: '<article>No audio here</article>',
    });
    const resolver = new GenericEpisodePageResolver({ fetcher });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toThrow('unsupported content type');
  });

  it('attaches the fetched response when it declines a non-HTML page', async () => {
    const fetcher = pageFetcher('');
    fetcher.fetch = async (url) => ({ url, contentType: 'application/pdf', text: '%PDF' });
    const resolver = new GenericEpisodePageResolver({ fetcher });

    await expect(
      resolver.resolve({ url: 'https://publisher.example/episodes/one' }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(NotHandledError);
      expect((error as NotHandledError).deferredResponse).toMatchObject({
        url: 'https://publisher.example/episodes/one',
        contentType: 'application/pdf',
        text: '%PDF',
      });
      return true;
    });
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

describe('GenericEpisodePageResolver — audio signals only (#120)', () => {
  const PAGE = 'https://publisher.example/';

  it.each([
    ['a <video> source', '<video controls><source src="/clip.mp4" type="video/mp4"></video>'],
    ['a <video src>', '<video src="/clip.mp4"></video>'],
    ['a <picture> source', '<picture><source srcset="/a.webp" type="image/webp"></picture>'],
    ['a video enclosure link', '<link rel="enclosure" href="/clip.mp4" type="video/mp4">'],
    ['an untyped non-audio enclosure', '<enclosure url="/document.pdf">'],
  ])('ignores %s', async (_label, html) => {
    const resolver = new GenericEpisodePageResolver({ fetcher: pageFetcher(html) });
    await expect(resolver.resolve({ url: PAGE })).rejects.toBeInstanceOf(NotHandledError);
  });

  it.each([
    ['an <audio> source', '<audio controls><source src="/ep.mp3"></audio>'],
    ['a standalone audio-typed source', '<source src="/ep.mp3" type="audio/mpeg">'],
    ['an audio enclosure link', '<link rel="enclosure" href="/ep.mp3" type="audio/mpeg">'],
    ['an untyped enclosure with an audio extension', '<enclosure url="/ep.m4a">'],
  ])('accepts %s', async (_label, html) => {
    const resolver = new GenericEpisodePageResolver({ fetcher: pageFetcher(html) });
    const resolved = await resolver.resolve({ url: PAGE });
    expect(resolved.mediaUrl).toMatch(/^https:\/\/publisher\.example\/ep\.(mp3|m4a)$/);
  });

  it('does not take an unrelated episode from the site feed', async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<link rel="alternate" type="application/rss+xml" href="/feed.xml">', {
        'https://publisher.example/feed.xml': {
          contentType: 'application/rss+xml',
          text:
            '<rss version="2.0"><channel><title>News</title>' +
            '<item><title>Latest episode</title><link>https://publisher.example/episodes/latest</link>' +
            '<enclosure url="https://cdn.example.com/latest.mp3" type="audio/mpeg"/></item>' +
            '</channel></rss>',
        },
      }),
    });
    await expect(
      resolver.resolve({ url: 'https://publisher.example/news/an-article' }),
    ).rejects.toBeInstanceOf(NotHandledError);
  });

  it("ignores a matching feed entry's video enclosure", async () => {
    const resolver = new GenericEpisodePageResolver({
      fetcher: pageFetcher('<link rel="alternate" type="application/rss+xml" href="/feed.xml">', {
        'https://publisher.example/feed.xml': {
          contentType: 'application/rss+xml',
          text:
            '<rss version="2.0"><channel><title>Blog</title>' +
            '<item><title>Clip</title><link>https://publisher.example/posts/clip</link>' +
            '<enclosure url="https://cdn.example.com/clip.mp4" type="video/mp4"/></item>' +
            '</channel></rss>',
        },
      }),
    });
    await expect(
      resolver.resolve({ url: 'https://publisher.example/posts/clip' }),
    ).rejects.toBeInstanceOf(NotHandledError);
  });
});

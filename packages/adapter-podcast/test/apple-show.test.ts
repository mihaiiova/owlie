import { describe, expect, it } from 'vitest';
import type { HttpFetcher } from '@owlieio/core';
import { CancelledError, ExtractionError } from '@owlieio/core';
import {
  parseAppleEpisodeUrl,
  parseAppleShowUrl,
  resolveAppleShowFeed,
} from '@owlieio/adapter-podcast';

const LOOKUP = 'https://itunes.apple.com/lookup?id=1554578197&country=us';
const FEED_URL = 'https://feeds.megaphone.fm/VMP9331026707';

function lookupFetcher(
  body: string,
  contentType: string | null = 'text/javascript; charset=utf-8',
): HttpFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetch(url) {
      calls.push(url);
      return { url, contentType, text: body };
    },
  };
}

const SHOW = { country: 'us', podcastId: '1554578197' };

describe('parseAppleShowUrl', () => {
  it('parses a show URL with a slug and a country, without network access', () => {
    expect(
      parseAppleShowUrl('https://podcasts.apple.com/us/podcast/unexplainable/id1554578197'),
    ).toEqual(SHOW);
  });

  it('parses a show URL without a slug, with a trailing slash or tracking query', () => {
    expect(parseAppleShowUrl('https://podcasts.apple.com/gb/podcast/id12345')).toEqual({
      country: 'gb',
      podcastId: '12345',
    });
    expect(parseAppleShowUrl('https://podcasts.apple.com/US/podcast/x/id12345/?uo=4')).toEqual({
      country: 'us',
      podcastId: '12345',
    });
  });

  it('treats a non-numeric i parameter as a show URL', () => {
    expect(parseAppleShowUrl('https://podcasts.apple.com/us/podcast/x/id12345?i=abc')).toEqual({
      country: 'us',
      podcastId: '12345',
    });
  });

  it('leaves episode URLs to the episode parser', () => {
    const episode = 'https://podcasts.apple.com/us/podcast/x/id12345?i=67890';
    expect(parseAppleShowUrl(episode)).toBeUndefined();
    expect(parseAppleEpisodeUrl(episode)).toBeDefined();
  });

  it('rejects other hosts, http, missing country and malformed ids', () => {
    for (const url of [
      'https://example.com/us/podcast/x/id12345',
      'http://podcasts.apple.com/us/podcast/x/id12345',
      'https://podcasts.apple.com/podcast/x/id12345',
      'https://podcasts.apple.com/us/podcast/x/idabc',
      'https://podcasts.apple.com/us/podcast/x/id12345x',
      'https://podcasts.apple.com/us/browse',
      'not a url',
    ]) {
      expect(parseAppleShowUrl(url), url).toBeUndefined();
    }
  });
});

describe('resolveAppleShowFeed', () => {
  it("resolves the show's feed URL through the lookup", async () => {
    const fetcher = lookupFetcher(
      JSON.stringify({
        resultCount: 1,
        results: [{ kind: 'podcast', collectionName: 'Unexplainable', feedUrl: FEED_URL }],
      }),
    );
    await expect(resolveAppleShowFeed(SHOW, { fetcher })).resolves.toEqual({
      feedUrl: FEED_URL,
      podcastId: '1554578197',
      showUrl: 'https://podcasts.apple.com/us/podcast/id1554578197',
      title: 'Unexplainable',
    });
    expect(fetcher.calls).toEqual([LOOKUP]);
  });

  it('accepts a standard JSON content type', async () => {
    const fetcher = lookupFetcher(
      JSON.stringify({ results: [{ feedUrl: FEED_URL }] }),
      'application/json',
    );
    await expect(resolveAppleShowFeed(SHOW, { fetcher })).resolves.toMatchObject({
      feedUrl: FEED_URL,
    });
  });

  it('fails clearly when the show has no public RSS feed', async () => {
    const fetcher = lookupFetcher(JSON.stringify({ results: [{ kind: 'podcast' }] }));
    const error = await resolveAppleShowFeed(SHOW, { fetcher }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as Error).message).toBe('Apple Podcasts show 1554578197 has no public RSS feed');
  });

  it('fails clearly when the show is not found', async () => {
    const fetcher = lookupFetcher(JSON.stringify({ resultCount: 0, results: [] }));
    await expect(resolveAppleShowFeed(SHOW, { fetcher })).rejects.toThrow(
      'Apple Podcasts show 1554578197 was not found',
    );
  });

  it('rejects an unexpected content type before parsing', async () => {
    const fetcher = lookupFetcher('<html></html>', 'text/html');
    const error = await resolveAppleShowFeed(SHOW, { fetcher }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as Error).message).toMatch(/unexpected lookup response content type text\/html/);
  });

  it('rejects a lookup body that is not valid JSON', async () => {
    const fetcher = lookupFetcher('not json');
    await expect(resolveAppleShowFeed(SHOW, { fetcher })).rejects.toBeInstanceOf(ExtractionError);
  });

  it('rejects an unsafe feed URL from the lookup', async () => {
    const fetcher = lookupFetcher(
      JSON.stringify({ results: [{ feedUrl: 'http://127.0.0.1/feed.xml' }] }),
    );
    await expect(resolveAppleShowFeed(SHOW, { fetcher })).rejects.toThrow();
  });

  it('does not fetch when the signal has already aborted', async () => {
    const fetcher = lookupFetcher('{}');
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolveAppleShowFeed(SHOW, { fetcher, signal: controller.signal }),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(fetcher.calls).toEqual([]);
  });

  it('passes the signal and policy to the fetcher', async () => {
    let seen: { signal?: AbortSignal; policy?: unknown } | undefined;
    const fetcher: HttpFetcher = {
      async fetch(url, options) {
        seen = options;
        return {
          url,
          contentType: 'text/javascript',
          text: JSON.stringify({ results: [{ feedUrl: FEED_URL }] }),
        };
      },
    };
    const controller = new AbortController();
    const policy = { maxResponseBytes: 1024 };
    await resolveAppleShowFeed(SHOW, { fetcher, policy, signal: controller.signal });
    expect(seen?.signal).toBe(controller.signal);
    expect(seen?.policy).toBe(policy);
  });
});

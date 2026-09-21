import { describe, expect, it } from 'vitest';
import type { ContentLocator, HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { CancelledError, ExtractionError } from '@owlieio/core';
import { FeedDiscoveryService, RssAdapter } from '@owlieio/adapter-rss';
import { RSS20 } from './fixtures.js';

const RSS_XML = RSS20;

function fakeFetcher(
  responses: Record<string, HttpTextResponse | (() => HttpTextResponse)>,
  calls?: { url: string; signal?: AbortSignal }[],
): HttpFetcher {
  return {
    async fetch(url, options) {
      calls?.push({ url, signal: options?.signal });
      const response = responses[url];
      if (!response) throw new ExtractionError(`unexpected fetch: ${url}`);
      return typeof response === 'function' ? response() : response;
    },
  };
}

describe('FeedDiscoveryService.discover', () => {
  it('discovers a declared RSS link resolved against the final page URL', async () => {
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'text/html',
        text: '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
      },
    });
    const result = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://example.com/',
    });
    expect(result).toEqual([
      {
        id: 'rss:feed:https://example.com/feed.xml',
        sourceType: 'rss',
        canonicalUrl: 'https://example.com/feed.xml',
        metadata: { format: 'rss' },
      },
    ]);
  });

  it('accepts application/xhtml+xml pages', async () => {
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'application/xhtml+xml',
        text: '<link rel="alternate" type="application/atom+xml" href="/atom.xml">',
      },
    });
    const result = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://example.com/',
    });
    expect(result.map((c) => c.canonicalUrl)).toEqual(['https://example.com/atom.xml']);
  });

  it('rejects a non-HTML declared page type', async () => {
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'application/json',
        text: '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
      },
    });
    const result = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://example.com/',
    });
    expect(result).toEqual([]);
  });

  it('ranks declared RSS before Atom regardless of document order', async () => {
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'text/html',
        text:
          '<link rel="alternate" type="application/atom+xml" href="/atom.xml">' +
          '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
      },
    });
    const result = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://example.com/',
    });
    expect(result.map((c) => c.canonicalUrl)).toEqual([
      'https://example.com/feed.xml',
      'https://example.com/atom.xml',
    ]);
  });

  it('probes the fixed conventional paths when no declared feed exists', async () => {
    const calls: { url: string }[] = [];
    const fetcher = fakeFetcher(
      {
        'https://example.com/': {
          url: 'https://example.com/',
          contentType: 'text/html',
          text: '<html><head><title>Home</title></head></html>',
        },
        'https://example.com/feed': {
          url: 'https://example.com/feed',
          contentType: 'application/rss+xml',
          text: RSS_XML,
        },
      },
      calls,
    );
    const result = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://example.com/',
    });
    expect(result.map((c) => c.canonicalUrl)).toEqual(['https://example.com/feed']);
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.com/',
      'https://example.com/feed',
      'https://example.com/rss',
      'https://example.com/feed.xml',
      'https://example.com/rss.xml',
      'https://example.com/atom.xml',
      'https://example.com/index.xml',
    ]);
  });

  it('skips a probe with an incompatible declared feed content type', async () => {
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'text/html',
        text: '<html></html>',
      },
      'https://example.com/feed': {
        url: 'https://example.com/feed',
        contentType: 'text/html',
        text: RSS_XML,
      },
    });
    const result = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://example.com/',
    });
    expect(result).toEqual([]);
  });

  it('propagates cancellation from a conventional-path probe', async () => {
    const controller = new AbortController();
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'text/html',
        text: '<html></html>',
      },
      'https://example.com/feed': () => {
        controller.abort();
        throw new CancelledError('discovery cancelled');
      },
    });
    const service = new FeedDiscoveryService({ fetcher });

    await expect(
      service.discover({ url: 'https://example.com/' }, { signal: controller.signal }),
    ).rejects.toThrow('discovery cancelled');
  });

  it('forwards cancellation and policy through every fetch', async () => {
    const calls: { url: string; signal?: AbortSignal }[] = [];
    const fetcher = fakeFetcher(
      {
        'https://example.com/': {
          url: 'https://example.com/',
          contentType: 'text/html',
          text: '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
        },
      },
      calls,
    );
    const signal = new AbortController().signal;
    await new FeedDiscoveryService({ fetcher }).discover(
      { url: 'https://example.com/' },
      { signal },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal).toBe(signal);
  });

  it('does not fetch a feed candidate during declared-link discovery', async () => {
    const calls: string[] = [];
    const fetcher: HttpFetcher = {
      async fetch(url) {
        calls.push(url);
        if (url === 'https://example.com/') {
          return {
            url,
            contentType: 'text/html',
            text: '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
          };
        }
        throw new ExtractionError(`unexpected fetch: ${url}`);
      },
    };
    await new FeedDiscoveryService({ fetcher }).discover({ url: 'https://example.com/' });
    expect(calls).toEqual(['https://example.com/']);
  });

  it('returns no candidates for a non-HTTP(S) or blocked supplied URL', async () => {
    const fetcher = fakeFetcher({});
    const service = new FeedDiscoveryService({ fetcher });
    expect(await service.discover({ url: 'ftp://example.com/' })).toEqual([]);
    expect(await service.discover({ url: 'https://localhost/' })).toEqual([]);
  });
});

describe('RssAdapter.discover', () => {
  it('delegates discovery through its injected fetcher and policy', async () => {
    const fetcher = fakeFetcher({
      'https://example.com/': {
        url: 'https://example.com/',
        contentType: 'text/html',
        text: '<link rel="alternate" type="application/atom+xml" href="/atom.xml">',
      },
    });
    const adapter = new RssAdapter({ fetcher });
    const locator: ContentLocator = { url: 'https://example.com/' };
    const result = await adapter.discover(locator);
    expect(result.map((c) => c.canonicalUrl)).toEqual(['https://example.com/atom.xml']);
  });
});

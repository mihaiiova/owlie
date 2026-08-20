import { describe, expect, it } from 'vitest';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { CancelledError, ExtractionError } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';
import { itemAdapterContract } from '@owlieio/testing/contract-tests';
import { CLEAN_ARTICLE } from './fixtures.js';

const fetcher: HttpFetcher = {
  async fetch() {
    return {
      url: 'https://example.com/articles/useful-story',
      contentType: 'text/html; charset=utf-8',
      text: CLEAN_ARTICLE,
    };
  },
  async fetchText() {
    return CLEAN_ARTICLE;
  },
};

describe('ArticleAdapter.resolveItem', () => {
  it('recognizes HTTP(S) URLs and derives a stable canonical article identity', async () => {
    const adapter = new ArticleAdapter({ fetcher });

    expect(
      adapter.recognize({ url: 'https://example.com/articles/useful-story?ref=rss#intro' }),
    ).toBe(true);
    expect(adapter.recognize({ url: 'ftp://example.com/articles/useful-story' })).toBe(false);

    await expect(
      adapter.resolveItem({ url: 'https://example.com/articles/useful-story?ref=rss#intro' }),
    ).resolves.toMatchObject({
      id: 'article:https://example.com/articles/useful-story?ref=rss',
      sourceType: 'article',
      canonicalUrl: 'https://example.com/articles/useful-story?ref=rss',
    });
  });
});

describe('ArticleAdapter.extract', () => {
  it('returns normalized readable text and article metadata from safe fetched HTML', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/useful-story' });

    await expect(adapter.extract(item)).resolves.toMatchObject({
      schemaVersion: 1,
      id: 'article:https://example.com/articles/useful-story',
      sourceType: 'article',
      canonicalUrl: 'https://example.com/articles/useful-story',
      mediaType: 'text',
      title: 'A useful article title',
      author: 'Avery Writer',
      publishedAt: '2025-08-19T10:00:00Z',
      text: expect.stringContaining('This is a deliberately substantial first paragraph'),
    });
  });

  it('uses the final post-redirect URL for the document identity', async () => {
    const redirectedFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        return {
          url: 'https://example.com/articles/canonical-story#section',
          contentType: 'application/xhtml+xml',
          text: CLEAN_ARTICLE,
        };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: redirectedFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/go/story' });

    await expect(adapter.extract(item)).resolves.toMatchObject({
      id: 'article:https://example.com/articles/canonical-story',
      canonicalUrl: 'https://example.com/articles/canonical-story',
    });
  });

  it('rejects a missing or non-HTML media type before parsing', async () => {
    const nonHtmlFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        return {
          url: 'https://example.com/file.pdf',
          contentType: 'application/pdf',
          text: '%PDF',
        };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: nonHtmlFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/file.pdf' });

    await expect(adapter.extract(item)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('maps no readable static content to an extraction error', async () => {
    const emptyFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        return {
          url: 'https://example.com/menu',
          contentType: 'text/html',
          text: '<nav>Menu</nav>',
        };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: emptyFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/menu' });

    await expect(adapter.extract(item)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('preserves cancellation from the fetch seam', async () => {
    const cancellingFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        throw new CancelledError('cancelled');
      },
    };
    const adapter = new ArticleAdapter({ fetcher: cancellingFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/useful-story' });

    await expect(adapter.extract(item)).rejects.toBeInstanceOf(CancelledError);
  });
});

itemAdapterContract('article', () => new ArticleAdapter({ fetcher }), {
  url: 'https://example.com/articles/useful-story',
});

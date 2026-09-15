import { describe, expect, it } from 'vitest';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { CancelledError, ExtractionError } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';
import { itemAdapterContract } from '@owlieio/testing/contract-tests';
import { CLEAN_ARTICLE, MAIN_WRAPPED_ARTICLE, MALFORMED_ARTICLE } from './fixtures.js';
import { normalizeDate } from '../src/article.js';

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

describe('normalizeDate', () => {
  it('canonicalizes valid timestamps to a stable ISO 8601 UTC form', () => {
    expect(normalizeDate('2025-08-19T10:00:00Z')).toBe('2025-08-19T10:00:00.000Z');
    expect(normalizeDate('2025-08-19T10:00:00.123Z')).toBe('2025-08-19T10:00:00.123Z');
    expect(normalizeDate('2025-08-19T12:00:00+02:00')).toBe('2025-08-19T10:00:00.000Z');
  });

  it('passes unparseable values through unchanged', () => {
    expect(normalizeDate('not-a-date')).toBe('not-a-date');
    expect(normalizeDate('')).toBe('');
  });
});

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

  it('honors the explicit private-host opt-in while resolving an article URL', async () => {
    const adapter = new ArticleAdapter({ fetcher, policy: { allowPrivateHosts: true } });

    await expect(
      adapter.resolveItem({ url: 'http://localhost:8080/story' }),
    ).resolves.toMatchObject({
      canonicalUrl: 'http://localhost:8080/story',
    });
  });
});

describe('ArticleAdapter.extract', () => {
  it('returns normalized readable text and article metadata from safe fetched HTML', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/useful-story' });

    const document = await adapter.extract(item);

    expect(document).toMatchObject({
      schemaVersion: 1,
      id: 'article:https://example.com/articles/useful-story',
      sourceType: 'article',
      canonicalUrl: 'https://example.com/articles/useful-story',
      mediaType: 'text',
      title: 'A useful article title',
      author: 'Avery Writer',
      publishedAt: '2025-08-19T10:00:00.000Z',
      text: expect.stringContaining('This is a deliberately substantial first paragraph'),
    });
    expect(document.text).toContain('links & controls');
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

  it('rejects a missing content type before parsing', async () => {
    const missingTypeFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        return { url: 'https://example.com/no-type', contentType: null, text: CLEAN_ARTICLE };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: missingTypeFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/no-type' });

    await expect(adapter.extract(item)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('extracts readable text from malformed static HTML', async () => {
    const malformedFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        return {
          url: 'https://example.com/malformed',
          contentType: 'text/html',
          text: MALFORMED_ARTICLE,
        };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: malformedFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/malformed' });

    await expect(adapter.extract(item)).resolves.toMatchObject({
      title: 'Malformed story',
      text: expect.stringContaining('deliberately unclosed paragraph'),
    });
  });

  it('extracts article bodies Readability keeps inside a <main> wrapper', async () => {
    const mainWrappedFetcher: HttpFetcher = {
      ...fetcher,
      async fetch() {
        return {
          url: 'https://example.com/articles/short-update',
          contentType: 'text/html',
          text: MAIN_WRAPPED_ARTICLE,
        };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: mainWrappedFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/short-update' });

    await expect(adapter.extract(item)).resolves.toMatchObject({
      title: 'Short update wrapped in main',
      text: expect.stringContaining('body lives inside a main element'),
    });
    const document = await adapter.extract(item);
    expect(document.text).toContain('second paragraph adds the concrete detail');
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

describe('ArticleAdapter.extractDeferred', () => {
  it('extracts from an already-fetched response without fetching again', async () => {
    let fetches = 0;
    const countingFetcher: HttpFetcher = {
      async fetch() {
        fetches += 1;
        throw new Error('should not fetch');
      },
      async fetchText() {
        throw new Error('should not fetch');
      },
    };
    const adapter = new ArticleAdapter({ fetcher: countingFetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/useful-story' });

    const document = await adapter.extractDeferred(item, {
      url: 'https://example.com/articles/useful-story',
      contentType: 'text/html; charset=utf-8',
      text: CLEAN_ARTICLE,
    });

    expect(fetches).toBe(0);
    expect(document).toMatchObject({
      id: 'article:https://example.com/articles/useful-story',
      sourceType: 'article',
      canonicalUrl: 'https://example.com/articles/useful-story',
      mediaType: 'text',
      title: 'A useful article title',
      text: expect.stringContaining('deliberately substantial first paragraph'),
    });
  });

  it('uses the final post-redirect URL for the document identity', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/go/story' });

    await expect(
      adapter.extractDeferred(item, {
        url: 'https://example.com/articles/canonical-story#section',
        contentType: 'application/xhtml+xml',
        text: CLEAN_ARTICLE,
      }),
    ).resolves.toMatchObject({
      id: 'article:https://example.com/articles/canonical-story',
      canonicalUrl: 'https://example.com/articles/canonical-story',
    });
  });

  it('refuses a response whose final URL is not safe-validated', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/useful-story' });

    await expect(
      adapter.extractDeferred(item, {
        url: 'http://127.0.0.1/private.html',
        contentType: 'text/html',
        text: CLEAN_ARTICLE,
      }),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it('rejects a non-HTML deferred response before parsing', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/file.pdf' });

    await expect(
      adapter.extractDeferred(item, {
        url: 'https://example.com/file.pdf',
        contentType: 'application/pdf',
        text: '%PDF',
      }),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it('preserves cancellation from the caller signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new ArticleAdapter({ fetcher });
    const item = await adapter.resolveItem({ url: 'https://example.com/articles/useful-story' });

    await expect(
      adapter.extractDeferred(
        item,
        {
          url: 'https://example.com/articles/useful-story',
          contentType: 'text/html',
          text: CLEAN_ARTICLE,
        },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(CancelledError);
  });
});

itemAdapterContract('article', () => new ArticleAdapter({ fetcher }), {
  url: 'https://example.com/articles/useful-story',
});

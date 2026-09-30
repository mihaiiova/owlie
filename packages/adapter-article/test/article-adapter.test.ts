import { describe, expect, it } from 'vitest';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { CancelledError, ExtractionError } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';
import { itemAdapterContract } from '@owlieio/testing/contract-tests';
import {
  CLEAN_ARTICLE,
  JSON_LD_GRAPH_ARTICLE,
  MAIN_WRAPPED_ARTICLE,
  MALFORMED_ARTICLE,
  MALFORMED_JSON_LD_ARTICLE,
  NO_ARTICLE,
  UNDECLARED_LONG_ARTICLE,
  WEBSITE_HOMEPAGE,
} from './fixtures.js';
import {
  declaredArticleSignal,
  MIN_READABLE_ARTICLE_CHARS,
  normalizeDate,
} from '../src/article.js';

const fetcher: HttpFetcher = {
  async fetch() {
    return {
      url: 'https://example.com/articles/useful-story',
      contentType: 'text/html; charset=utf-8',
      text: CLEAN_ARTICLE,
    };
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
      schemaVersion: 2,
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
    expect(document.provenance).toMatchObject({
      sourceId: 'article:https://example.com/articles/useful-story',
      canonicalUrl: 'https://example.com/articles/useful-story',
      adapterId: 'article',
    });
    expect(document.provenance.contentFingerprint.algorithm).toBe('sha256');
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

function htmlResponse(text: string, contentType = 'text/html; charset=utf-8') {
  return { url: 'https://example.com/articles/page', contentType, text };
}

describe('declaredArticleSignal', () => {
  it('reads og:type article regardless of attribute order', () => {
    expect(declaredArticleSignal(MAIN_WRAPPED_ARTICLE)).toBe('og-article');
    expect(declaredArticleSignal('<meta content="Article" property="og:type">')).toBe('og-article');
  });

  it('reads JSON-LD article types, including @graph and @type arrays', () => {
    expect(declaredArticleSignal(JSON_LD_GRAPH_ARTICLE)).toBe('json-ld-article');
  });

  it('skips malformed JSON-LD blocks and keeps reading later ones', () => {
    expect(declaredArticleSignal(MALFORMED_JSON_LD_ARTICLE)).toBe('json-ld-article');
  });

  it('reports a declared non-article og:type', () => {
    expect(declaredArticleSignal(WEBSITE_HOMEPAGE)).toBe('og-non-article');
  });

  it('reports none when the page declares nothing', () => {
    expect(declaredArticleSignal(CLEAN_ARTICLE)).toBe('none');
  });
});

describe('ArticleAdapter.classify', () => {
  const item = {
    id: 'article:https://example.com/articles/page',
    sourceType: 'article' as const,
    canonicalUrl: 'https://example.com/articles/page',
    metadata: {},
  };

  it('classifies a declared article and returns its document', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const result = await adapter.classify(item, { response: htmlResponse(JSON_LD_GRAPH_ARTICLE) });
    expect(result.isArticle).toBe(true);
    expect(result.signal).toBe('json-ld-article');
    expect(result.document?.text).toContain('A short but real news story');
  });

  it('classifies an undeclared page by a readable body of at least the minimum length', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const result = await adapter.classify(item, {
      response: htmlResponse(UNDECLARED_LONG_ARTICLE),
    });
    expect(result.isArticle).toBe(true);
    expect(result.signal).toBe('readable-body');
    expect(result.document!.text.length).toBeGreaterThanOrEqual(MIN_READABLE_ARTICLE_CHARS);
  });

  it('does not classify an undeclared page with a short readable body', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const result = await adapter.classify(item, { response: htmlResponse(CLEAN_ARTICLE) });
    expect(result.isArticle).toBe(false);
    expect(result.signal).toBe('none');
    expect(result.document?.text).toContain('deliberately substantial first paragraph');
  });

  it('does not use the readable body when og:type declares a non-article', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const result = await adapter.classify(item, { response: htmlResponse(WEBSITE_HOMEPAGE) });
    expect(result.isArticle).toBe(false);
    expect(result.signal).toBe('og-non-article');
  });

  it('does not classify a page with no readable content', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const result = await adapter.classify(item, { response: htmlResponse(NO_ARTICLE) });
    expect(result.isArticle).toBe(false);
    expect(result.document).toBeUndefined();
  });

  it('does not classify a non-HTML response', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const result = await adapter.classify(item, {
      response: htmlResponse(JSON_LD_GRAPH_ARTICLE, 'application/json'),
    });
    expect(result.isArticle).toBe(false);
    expect(result.document).toBeUndefined();
  });

  it('fetches the page once when no response is supplied and returns it', async () => {
    let calls = 0;
    const counting: HttpFetcher = {
      async fetch(url) {
        calls++;
        return { url, contentType: 'text/html', text: JSON_LD_GRAPH_ARTICLE };
      },
    };
    const adapter = new ArticleAdapter({ fetcher: counting });
    const result = await adapter.classify(item);
    expect(calls).toBe(1);
    expect(result.response.text).toBe(JSON_LD_GRAPH_ARTICLE);
    expect(result.isArticle).toBe(true);
  });

  it('propagates cancellation', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.classify(item, {
        response: htmlResponse(JSON_LD_GRAPH_ARTICLE),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError);
  });
});

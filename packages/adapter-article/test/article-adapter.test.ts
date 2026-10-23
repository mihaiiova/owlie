import { describe, expect, it } from 'vitest';
import {
  ARTICLE_TEXT_RECOVERED,
  ArticleAdapter,
  DEFAULT_MAX_PDF_BYTES,
  PDF_TRUNCATED_PAGES,
} from '@owlieio/adapter-article';
import { CancelledError, ExtractionError } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';
import { itemAdapterContract } from '@owlieio/testing/contract-tests';
import {
  CLEAN_ARTICLE,
  CUSTOM_ELEMENT_ARTICLE,
  DIALOG_ONLY_ARTICLE,
  DIALOG_ONLY_WEBSITE,
  NESTED_CUSTOM_ARTICLE,
  PARTIAL_DIALOG_ARTICLE,
  SHORT_ARTICLE,
  JSON_LD_GRAPH_ARTICLE,
  MAIN_WRAPPED_ARTICLE,
  MALFORMED_ARTICLE,
  MALFORMED_JSON_LD_ARTICLE,
  NO_ARTICLE,
  STRUCTURED_ARTICLE,
  UNDECLARED_LONG_ARTICLE,
  WEBSITE_HOMEPAGE,
} from './fixtures.js';
import {
  declaredArticleSignal,
  MIN_READABLE_ARTICLE_CHARS,
  normalizeDate,
} from '../src/article.js';
import { buildPdf, paperPdf } from '@owlieio/testing';

const fetcher: HttpFetcher = {
  async fetch() {
    return {
      url: 'https://example.com/articles/useful-story',
      contentType: 'text/html; charset=utf-8',
      text: CLEAN_ARTICLE,
    };
  },
};

function htmlFetcher(text: string): HttpFetcher {
  return {
    async fetch(url) {
      return { url, contentType: 'text/html; charset=utf-8', text };
    },
  };
}

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

  it('keeps paragraph, heading, list and line breaks in the text', async () => {
    const adapter = new ArticleAdapter({ fetcher: htmlFetcher(STRUCTURED_ARTICLE) });
    const document = await adapter.extract(
      await adapter.resolveItem({ url: 'https://example.com/articles/structured' }),
    );

    expect(document.text).toContain(
      'The opening paragraph explains why structure matters for anyone who reads extracted text, and it wraps across source lines on purpose.\n\nEscaped markup\n\nWrite',
    );
    expect(document.text).toContain('\n\nFirst point\nSecond point\n\n');
    expect(document.text).toContain('\n\nA quoted remark that stands on its own.\n\n');
    expect(document.text).toContain('One line\nNext line after a break');
    expect(document.text).not.toMatch(/\n{3,}/);
    expect(document.text).not.toMatch(/^\s|\s$/);
    expect(document.text.split('\n').every((line) => line === line.trim())).toBe(true);
  });

  it('keeps literal angle-bracket text and preformatted lines', async () => {
    const adapter = new ArticleAdapter({ fetcher: htmlFetcher(STRUCTURED_ARTICLE) });
    const document = await adapter.extract(
      await adapter.resolveItem({ url: 'https://example.com/articles/structured' }),
    );

    expect(document.text).toContain(
      'Write <div class="x"> to open a block, because 3 < 4 && 5 > 2 holds.',
    );
    expect(document.text).toContain('const a = 1;\nif (a < 2) {\nreturn <b>;\n}');
    expect(document.text).toContain('\n\nfirst\nsecond\n\n');
  });

  it('drops empty preformatted blocks without leaving extra blank lines', async () => {
    const html = STRUCTURED_ARTICLE.replace(
      '<blockquote>',
      '<pre><code></code></pre><pre>  </pre><blockquote>',
    ).replace('</table>', '</table><pre><code></code></pre>');
    const adapter = new ArticleAdapter({ fetcher: htmlFetcher(html) });
    const document = await adapter.extract(
      await adapter.resolveItem({ url: 'https://example.com/articles/structured' }),
    );

    expect(document.text).toContain('}\n\nA quoted remark that stands on its own.');
    expect(document.text).not.toMatch(/\n{3,}/);
    expect(document.text).not.toMatch(/^\s|\s$/);
  });

  it('keeps disclosure blocks and table cells apart', async () => {
    const adapter = new ArticleAdapter({ fetcher: htmlFetcher(STRUCTURED_ARTICLE) });
    const document = await adapter.extract(
      await adapter.resolveItem({ url: 'https://example.com/articles/structured' }),
    );

    expect(document.text).toContain('\n\nQuestion\n\nAnswer\n\n');
    expect(document.text).toContain('\nCell one Cell two\n');
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

  it('fetches with a feed-header stop and classifies a feed as not an article', async () => {
    let stopReading: ((text: string, type: string | null) => boolean) | undefined;
    const feedFetcher: HttpFetcher = {
      async fetch(url, options) {
        stopReading = options?.stopReading;
        return { url, contentType: 'application/rss+xml', text: '<rss><channel></channel></rss>' };
      },
    };
    const result = await new ArticleAdapter({ fetcher: feedFetcher }).classify(item);
    expect(result.isArticle).toBe(false);
    expect(stopReading?.('<rss><channel><item>', 'application/rss+xml')).toBe(true);
    expect(stopReading?.('<html><body><item>', 'text/html')).toBe(false);
  });

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

describe('ArticleAdapter on PDFs', () => {
  interface Calls {
    text: string[];
    bytes: { url: string; maxBytes?: number }[];
  }

  function pdfFetcher(
    responses: {
      text?: (url: string) => { contentType: string | null; text: string };
      bytes?: (url: string) => { contentType: string | null; bytes: Uint8Array };
    },
    calls: Calls = { text: [], bytes: [] },
  ): HttpFetcher {
    return {
      async fetch(url, options) {
        calls.text.push(url);
        const { contentType, text } = responses.text!(url);
        const stopped = options?.stopReading?.(text.slice(0, 16), contentType) ?? false;
        return {
          url,
          contentType,
          text: stopped ? text.slice(0, 16) : text,
          ...(stopped ? { partial: true } : {}),
        };
      },
      async fetchBytes(url, options) {
        calls.bytes.push({ url, maxBytes: options?.maxBytes });
        return { url, ...responses.bytes!(url) };
      },
    };
  }

  const pdfBytes = () => ({ contentType: 'application/pdf', bytes: paperPdf() });
  const item = (url: string) => new ArticleAdapter({ fetcher }).resolveItem({ url });

  it('fetches a .pdf URL as bytes up front and reads it as a PDF article', async () => {
    const calls: Calls = { text: [], bytes: [] };
    const adapter = new ArticleAdapter({ fetcher: pdfFetcher({ bytes: pdfBytes }, calls) });
    const document = await adapter.extract(await item('https://example.com/papers/study.pdf#p=2'));

    expect(calls.text).toEqual([]);
    expect(calls.bytes).toEqual([
      { url: 'https://example.com/papers/study.pdf', maxBytes: DEFAULT_MAX_PDF_BYTES },
    ]);
    expect(document).toMatchObject({
      id: 'article:https://example.com/papers/study.pdf',
      sourceType: 'article',
      mediaType: 'text',
      title: 'A Study of Careful Extraction',
      author: 'Ada Example',
      publishedAt: '2024-01-15T08:30:00.000Z',
      metadata: { format: 'pdf', pageCount: 3, pagesRead: 3 },
    });
    expect(document.text).toContain('We study how text is extracted from documents');
    expect(document.provenance.warnings).toEqual([]);
  });

  it('re-fetches a declared application/pdf body without an extension as bytes', async () => {
    const calls: Calls = { text: [], bytes: [] };
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher(
        {
          text: () => ({ contentType: 'application/pdf', text: '%PDF-1.4 binary...' }),
          bytes: pdfBytes,
        },
        calls,
      ),
    });
    const document = await adapter.extract(await item('https://arxiv.org/pdf/2401.12345'));
    expect(calls.text).toEqual(['https://arxiv.org/pdf/2401.12345']);
    expect(calls.bytes.map((call) => call.url)).toEqual(['https://arxiv.org/pdf/2401.12345']);
    expect(document.metadata).toMatchObject({ format: 'pdf' });
  });

  it('recognizes a PDF by its signature when the declared type is generic', async () => {
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher({
        text: () => ({ contentType: 'application/octet-stream', text: '%PDF-1.4 binary' }),
        bytes: () => ({ contentType: 'application/octet-stream', bytes: paperPdf() }),
      }),
    });
    const document = await adapter.extract(await item('https://example.com/download?id=7'));
    expect(document.metadata).toMatchObject({ format: 'pdf' });
  });

  it('reads a .pdf URL that serves a page as the page it is', async () => {
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher({
        bytes: () => ({
          contentType: 'text/html; charset=utf-8',
          bytes: new TextEncoder().encode(CLEAN_ARTICLE),
        }),
      }),
    });
    const document = await adapter.extract(await item('https://example.com/report.pdf'));
    expect(document.metadata).toEqual({});
    expect(document.text.length).toBeGreaterThan(0);
  });

  it('rejects a .pdf URL whose body is neither a PDF nor a page', async () => {
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher({
        bytes: () => ({ contentType: 'application/pdf', bytes: new TextEncoder().encode('oops') }),
      }),
    });
    await expect(adapter.extract(await item('https://example.com/report.pdf'))).rejects.toThrow(
      'response declares a PDF but its body is not one: https://example.com/report.pdf',
    );
  });

  it('applies the configured caps and warns when pages were skipped', async () => {
    const calls: Calls = { text: [], bytes: [] };
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher({ bytes: pdfBytes }, calls),
      pdf: { maxBytes: 1_000_000, maxPages: 2 },
    });
    const document = await adapter.extract(await item('https://example.com/study.pdf'));
    expect(calls.bytes[0]?.maxBytes).toBe(1_000_000);
    expect(document.metadata).toMatchObject({ pageCount: 3, pagesRead: 2 });
    expect(document.provenance.warnings).toEqual([
      { code: PDF_TRUNCATED_PAGES, message: 'read the first 2 of 3 PDF pages' },
    ]);
  });

  it('fails clearly when the fetcher cannot read binary responses', async () => {
    const adapter = new ArticleAdapter({ fetcher });
    await expect(adapter.extract(await item('https://example.com/study.pdf'))).rejects.toThrow(
      'PDF extraction needs a fetcher that can read binary responses',
    );
  });

  it('extracts a deferred PDF response by re-fetching it as bytes', async () => {
    const adapter = new ArticleAdapter({ fetcher: pdfFetcher({ bytes: pdfBytes }) });
    const document = await adapter.extractDeferred(await item('https://example.com/doc'), {
      url: 'https://example.com/doc',
      contentType: 'application/pdf',
      text: '%PDF-',
      partial: true,
    });
    expect(document.metadata).toMatchObject({ format: 'pdf' });
  });

  it('classifies a PDF as an article and returns its document', async () => {
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher({
        text: () => ({ contentType: 'application/pdf', text: '%PDF-1.4 binary' }),
        bytes: pdfBytes,
      }),
    });
    const page = await adapter.classify(await item('https://example.com/doc'));
    expect(page).toMatchObject({ isArticle: true, signal: 'pdf' });
    expect(page.document?.metadata).toMatchObject({ format: 'pdf' });
  });

  it('classifies a deferred PDF response handed over by another adapter', async () => {
    const adapter = new ArticleAdapter({ fetcher: pdfFetcher({ bytes: pdfBytes }) });
    const page = await adapter.classify(await item('https://example.com/doc'), {
      response: { url: 'https://example.com/doc', contentType: 'application/pdf', text: '' },
    });
    expect(page).toMatchObject({ isArticle: true, signal: 'pdf' });
  });

  it('surfaces an unreadable PDF instead of classifying it as a non-article page', async () => {
    const adapter = new ArticleAdapter({
      fetcher: pdfFetcher({
        bytes: () => ({
          contentType: 'application/pdf',
          bytes: buildPdf([{ lines: ['Secret.'] }], { encrypted: true }),
        }),
      }),
    });
    await expect(adapter.classify(await item('https://example.com/secret.pdf'))).rejects.toThrow(
      'PDF is encrypted',
    );
  });
});

describe('ArticleAdapter on custom elements and empty articles (#172)', () => {
  const extractPage = async (html: string, url = 'https://blog.example.com/products/gmp-drop/') => {
    const adapter = new ArticleAdapter({ fetcher: htmlFetcher(html) });
    return adapter.extract(await adapter.resolveItem({ url }));
  };
  const failure = async (html: string) => {
    try {
      await extractPage(html);
    } catch (error) {
      return error as ExtractionError;
    }
    throw new Error('expected extraction to fail');
  };

  it('keeps the text of paragraphs inside custom elements, without their tags or scripts', async () => {
    const document = await extractPage(CUSTOM_ELEMENT_ARTICLE);
    expect(document.text).toContain('Google Marketing Platform brings new measurement features');
    expect(document.text).toContain('audience lists that update on their own');
    expect(document.text).not.toMatch(/uni-article|data-analytics|tracking|color:red/);
    expect(document.provenance.warnings).toEqual([]);
  });

  it('keeps paragraphs nested two custom elements deep', async () => {
    const document = await extractPage(NESTED_CUSTOM_ARTICLE);
    expect(document.text).toContain('Google Marketing Platform brings new measurement features');
    expect(document.text).toContain('audience lists that update on their own');
  });

  it('recovers article text the sanitizer drops, with a warning', async () => {
    const document = await extractPage(DIALOG_ONLY_ARTICLE);
    expect(document.text).toContain('Google Marketing Platform brings new measurement features');
    expect(document.provenance.warnings).toEqual([
      {
        code: ARTICLE_TEXT_RECOVERED,
        message: 'article text recovered from unsanitized readable content',
      },
    ]);
  });

  it('recovers a body sanitizing partly dropped, even when the rest is over 200 characters', async () => {
    const document = await extractPage(PARTIAL_DIALOG_ARTICLE);
    expect(document.text).toContain('Google Marketing Platform brings new measurement features');
    expect(document.text).toContain('audience lists that update on their own');
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      ARTICLE_TEXT_RECOVERED,
    ]);
  });

  it('keeps a fully sanitized article as it is, with no warning', async () => {
    const document = await extractPage(CUSTOM_ELEMENT_ARTICLE);
    expect(document.provenance.warnings).toEqual([]);
  });

  it('says ARTICLE_NO_READABLE_TEXT when Readability finds nothing, keeping the message', async () => {
    const error = await failure(NO_ARTICLE);
    expect(error).toBeInstanceOf(ExtractionError);
    expect(error.code).toBe('ARTICLE_NO_READABLE_TEXT');
    expect(error.message).toMatch(/^no readable static article content at /);
    expect(error.details).toMatchObject({ readableChars: 0, sanitizedChars: 0 });
  });

  it('says ARTICLE_TEXT_DROPPED when text was found but sanitizing lost it on a non-article page', async () => {
    const error = await failure(DIALOG_ONLY_WEBSITE);
    expect(error.code).toBe('ARTICLE_TEXT_DROPPED');
    expect(error.details).toMatchObject({ declaredSignal: 'other' });
    expect(Number(error.details?.readableChars)).toBeGreaterThan(200);
    expect(Number(error.details?.sanitizedChars)).toBeLessThan(200);
  });

  it('says ARTICLE_TOO_SHORT for a short post', async () => {
    const error = await failure(SHORT_ARTICLE);
    expect(error.code).toBe('ARTICLE_TOO_SHORT');
    expect(error.details).toMatchObject({ declaredSignal: 'og-article', customElementCount: 0 });
    expect(Number(error.details?.readableChars)).toBeGreaterThan(0);
  });

  it('reports only counts, flags and enums in the details', async () => {
    const error = await failure(DIALOG_ONLY_WEBSITE);
    expect(Object.keys(error.details ?? {}).sort()).toEqual([
      'customElementCount',
      'declaredSignal',
      'htmlBytes',
      'readableChars',
      'sanitizedChars',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type {
  ContentItem,
  DeferredResponseItemAdapter,
  HttpFetcher,
  HttpTextResponse,
  ItemAdapter,
  NormalizedDocument,
} from '@owlieio/core';
import {
  buildProvenance,
  CancelledError,
  ConfigurationError,
  ExtractionError,
} from '@owlieio/core';
import {
  ARXIV_ABSTRACT_ONLY,
  ARXIV_WITHDRAWN,
  ArxivCollectionAdapter,
  ArxivPaperAdapter,
  RequestGate,
} from '@owlieio/adapter-arxiv';
import { arxivFixtures } from '@owlieio/testing';

const {
  API_ATTENTION,
  API_EMPTY,
  API_OLD_STYLE,
  API_QUERY,
  API_WITHDRAWN,
  LATEXML_HTML,
  RSS_CS_CL,
} = arxivFixtures;

const ATOM = 'application/atom+xml; charset=utf-8';
const HTML = 'text/html; charset=utf-8';

type Route =
  | HttpTextResponse
  | { status: number }
  | { pdfText: string; pageCount: number }
  | { pdfError: string };

/** A fake network: exact URLs to responses, recording every request in order. */
function network(routes: Record<string, Route>) {
  const requests: string[] = [];
  const lookup = (url: string): Route => {
    const route = routes[url];
    if (!route) throw new ExtractionError(`HTTP 404 Not Found for ${url}`);
    if ('status' in route) throw new ExtractionError(`HTTP ${route.status} for ${url}`);
    return route;
  };
  const fetcher: HttpFetcher = {
    async fetch(url) {
      requests.push(url);
      const route = lookup(url);
      if (!('text' in route)) return { url, contentType: 'application/pdf', text: '%PDF-' };
      return { ...route, url };
    },
  };
  return { fetcher, requests, lookup };
}

function doc(
  url: string,
  text: string,
  metadata: Record<string, unknown> = {},
): NormalizedDocument {
  return {
    schemaVersion: 2,
    id: `article:${url}`,
    sourceType: 'article',
    canonicalUrl: url,
    mediaType: 'text',
    text,
    metadata,
    provenance: buildProvenance({
      sourceId: `article:${url}`,
      canonicalUrl: url,
      adapterId: 'article',
      text,
      fetchedAt: '2026-10-22T00:00:00.000Z',
    }),
  };
}

/**
 * Stands in for the article adapter the CLI composes in: it records the HTML
 * handed over, reads it as tag-stripped text, and serves PDF routes.
 */
function fakeArticle(net: ReturnType<typeof network>) {
  const handedOver: string[] = [];
  const adapter: ItemAdapter & DeferredResponseItemAdapter = {
    id: 'article',
    sourceType: 'article',
    recognize: () => true,
    async resolveItem({ url }): Promise<ContentItem> {
      return { id: `article:${url}`, sourceType: 'article', canonicalUrl: url, metadata: {} };
    },
    async extractDeferred(item, response) {
      handedOver.push(response.text);
      const text = response.text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return doc(item.canonicalUrl, text);
    },
    async extract(item) {
      net.requests.push(`pdf ${item.canonicalUrl}`);
      const route = net.lookup(item.canonicalUrl);
      if ('pdfError' in route) throw new ExtractionError(route.pdfError);
      if (!('pdfText' in route)) return doc(item.canonicalUrl, 'a page');
      return doc(item.canonicalUrl, route.pdfText, { format: 'pdf', pageCount: route.pageCount });
    },
  };
  return { adapter, handedOver };
}

const api = (id: string) => `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
const atom = (text: string): HttpTextResponse => ({ url: '', contentType: ATOM, text });
const html = (text: string): HttpTextResponse => ({ url: '', contentType: HTML, text });

/** A gate with no real waiting, recording the delays it would have waited. */
function instantGate() {
  let clock = 0;
  const waits: number[] = [];
  const gate = new RequestGate(
    3_000,
    () => clock,
    async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  );
  return { gate, waits, advance: (ms: number) => (clock += ms) };
}

function paperAdapter(routes: Record<string, Route>, options: { abstractOnly?: boolean } = {}) {
  const net = network(routes);
  const article = fakeArticle(net);
  const adapter = new ArxivPaperAdapter({
    fetcher: net.fetcher,
    article: article.adapter,
    apiGate: instantGate().gate,
    ...options,
  });
  return { adapter, requests: net.requests, handedOver: article.handedOver };
}

async function extract(adapter: ArxivPaperAdapter, url: string) {
  return adapter.extract(await adapter.resolveItem({ url }));
}

describe('ArxivPaperAdapter recognition and identity', () => {
  it('recognizes paper URLs only and resolves a version-less identity', async () => {
    const { adapter } = paperAdapter({});
    expect(adapter.recognize({ url: 'https://arxiv.org/pdf/1706.03762v7' })).toBe(true);
    expect(adapter.recognize({ url: 'https://rss.arxiv.org/rss/cs.CL' })).toBe(false);
    expect(adapter.recognize({ url: 'https://example.com/abs/1706.03762' })).toBe(false);
    await expect(
      adapter.resolveItem({ url: 'https://arxiv.org/html/1706.03762v7/' }),
    ).resolves.toEqual({
      id: 'arxiv:1706.03762',
      sourceType: 'arxiv',
      canonicalUrl: 'https://arxiv.org/abs/1706.03762',
      metadata: { arxivId: '1706.03762', requestedVersion: 'v7' },
    });
    await expect(adapter.resolveItem({ url: 'https://arxiv.org/' })).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });
});

describe('ArxivPaperAdapter.extract', () => {
  it('reads the HTML render, prepared, behind a header from the API', async () => {
    const { adapter, requests, handedOver } = paperAdapter({
      [api('1706.03762')]: atom(API_ATTENTION),
      'https://arxiv.org/html/1706.03762': html(LATEXML_HTML),
    });
    const document = await extract(adapter, 'https://arxiv.org/abs/1706.03762');

    expect(requests).toEqual([api('1706.03762'), 'https://arxiv.org/html/1706.03762']);
    expect(handedOver).toHaveLength(1);
    expect(handedOver[0]).toContain('$h_{t}$');
    expect(handedOver[0]).not.toContain('<math');
    expect(handedOver[0]).not.toContain('class="ltx_abstract"');
    expect(document).toMatchObject({
      id: 'arxiv:1706.03762',
      sourceType: 'arxiv',
      canonicalUrl: 'https://arxiv.org/abs/1706.03762',
      mediaType: 'text',
      title: 'Attention Is All You Need',
      author: 'Ashish Vaswani, Noam Shazeer, Niki Parmar',
      publishedAt: '2017-06-12T17:57:34.000Z',
      metadata: {
        arxivId: '1706.03762',
        version: 'v7',
        versionedId: '1706.03762v7',
        primaryCategory: 'cs.CL',
        categories: ['cs.CL', 'cs.LG'],
        authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
        comment: '15 pages, 5 figures',
        updated: '2023-08-02T00:41:18.000Z',
        absUrl: 'https://arxiv.org/abs/1706.03762v7',
        pdfUrl: 'https://arxiv.org/pdf/1706.03762v7',
        textSource: 'html',
      },
      provenance: { adapterId: 'arxiv', sourceId: 'arxiv:1706.03762', warnings: [] },
    });
    expect(
      document.text.startsWith(
        'Attention Is All You Need\n\nAshish Vaswani, Noam Shazeer, Niki Parmar\n\nAbstract\n\nThe dominant',
      ),
    ).toBe(true);
    expect(document.text).toContain('Introduction');
  });

  it('reads the version a URL names', async () => {
    const { adapter, requests } = paperAdapter({
      [api('1706.03762v2')]: atom(API_ATTENTION),
      'https://arxiv.org/html/1706.03762v2': html(LATEXML_HTML),
    });
    const document = await extract(adapter, 'https://arxiv.org/abs/1706.03762v2');
    expect(requests[1]).toBe('https://arxiv.org/html/1706.03762v2');
    expect(document.id).toBe('arxiv:1706.03762');
    expect(document.metadata).toMatchObject({ version: 'v2', versionedId: '1706.03762v2' });
  });

  it('falls back to the PDF when there is no HTML render', async () => {
    const { adapter, requests } = paperAdapter({
      [api('hep-th/9901001')]: atom(API_OLD_STYLE),
      'https://arxiv.org/pdf/hep-th/9901001': {
        pdfText: 'We study how text is extracted from documents.',
        pageCount: 3,
      },
    });
    const document = await extract(adapter, 'https://arxiv.org/abs/hep-th/9901001');
    expect(requests).toContain('https://arxiv.org/html/hep-th/9901001');
    expect(requests).toContain('pdf https://arxiv.org/pdf/hep-th/9901001');
    expect(document.metadata).toMatchObject({
      textSource: 'pdf',
      pageCount: 3,
      doi: '10.1143/PTP.101.1155',
      journalRef: 'Prog.Theor.Phys.101:1155-1164,1999',
    });
    expect(document.text).toContain('We study how text is extracted from documents');
    expect(document.provenance.warnings).toEqual([]);
  });

  it('falls back to the PDF when the HTML page is not a LaTeXML render', async () => {
    const { adapter } = paperAdapter({
      [api('1706.03762')]: atom(API_ATTENTION),
      'https://arxiv.org/html/1706.03762': html('<html><body>No HTML for this paper</body></html>'),
      'https://arxiv.org/pdf/1706.03762': { pdfText: 'PDF body.', pageCount: 3 },
    });
    const document = await extract(adapter, 'https://arxiv.org/abs/1706.03762');
    expect(document.metadata.textSource).toBe('pdf');
  });

  it('returns the abstract with a warning when neither the HTML nor the PDF can be read', async () => {
    const { adapter } = paperAdapter({
      [api('1706.03762')]: atom(API_ATTENTION),
      'https://arxiv.org/pdf/1706.03762': { pdfError: 'PDF is encrypted' },
    });
    const document = await extract(adapter, 'https://arxiv.org/abs/1706.03762');
    expect(document.metadata.textSource).toBe('abstract');
    expect(document.text).toMatch(/Abstract\n\nThe dominant[^]*works\.$/);
    expect(document.provenance.warnings).toEqual([
      { code: ARXIV_ABSTRACT_ONLY, message: 'the paper could not be read; returning its abstract' },
    ]);
  });

  it('reads only the API with abstractOnly, and warns about nothing', async () => {
    const { adapter, requests } = paperAdapter(
      { [api('1706.03762')]: atom(API_ATTENTION) },
      { abstractOnly: true },
    );
    const document = await extract(adapter, 'https://arxiv.org/abs/1706.03762');
    expect(requests).toEqual([api('1706.03762')]);
    expect(document.metadata.textSource).toBe('abstract');
    expect(document.provenance.warnings).toEqual([]);
  });

  it('marks a withdrawn paper and does not read it', async () => {
    const { adapter, requests } = paperAdapter({ [api('2301.00002')]: atom(API_WITHDRAWN) });
    const document = await extract(adapter, 'https://arxiv.org/abs/2301.00002');
    expect(requests).toHaveLength(1);
    expect(document.provenance.warnings).toEqual([
      { code: ARXIV_WITHDRAWN, message: 'this paper has been withdrawn' },
    ]);
  });

  it('fails for an unknown paper', async () => {
    const { adapter } = paperAdapter({ [api('2401.99999')]: atom(API_EMPTY) });
    await expect(extract(adapter, 'https://arxiv.org/abs/2401.99999')).rejects.toThrow(
      'arXiv paper 2401.99999 not found',
    );
  });

  it('checks the API content type before parsing', async () => {
    const { adapter } = paperAdapter({ [api('1706.03762')]: html('<html></html>') });
    await expect(extract(adapter, 'https://arxiv.org/abs/1706.03762')).rejects.toThrow(
      'arXiv API returned unsupported content type: text/html; charset=utf-8',
    );
  });

  it('reads abstracts without an article adapter', async () => {
    const net = network({ [api('1706.03762')]: atom(API_ATTENTION) });
    const adapter = new ArxivPaperAdapter({ fetcher: net.fetcher, apiGate: instantGate().gate });
    const document = await extract(adapter, 'https://arxiv.org/abs/1706.03762');
    expect(document.metadata.textSource).toBe('abstract');
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      ARXIV_ABSTRACT_ONLY,
    ]);
  });

  it('propagates cancellation instead of falling back', async () => {
    const controller = new AbortController();
    const fetcher: HttpFetcher = {
      async fetch(url) {
        if (url.includes('/html/')) {
          controller.abort();
          throw new CancelledError('cancelled');
        }
        return { url, contentType: ATOM, text: API_ATTENTION };
      },
    };
    const adapter = new ArxivPaperAdapter({
      fetcher,
      article: fakeArticle(network({})).adapter,
      apiGate: instantGate().gate,
    });
    const item = await adapter.resolveItem({ url: 'https://arxiv.org/abs/1706.03762' });
    await expect(adapter.extract(item, { signal: controller.signal })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });
});

describe('ArxivCollectionAdapter', () => {
  function collectionAdapter(routes: Record<string, Route>, includeReplacements?: boolean) {
    const net = network(routes);
    const gate = instantGate();
    const adapter = new ArxivCollectionAdapter({
      fetcher: net.fetcher,
      apiGate: gate.gate,
      ...(includeReplacements ? { includeReplacements } : {}),
    });
    return { adapter, requests: net.requests, waits: gate.waits };
  }

  const rss = (text: string): HttpTextResponse => ({
    url: '',
    contentType: 'application/rss+xml',
    text,
  });

  it('resolves categories and queries to stable identities', async () => {
    const { adapter } = collectionAdapter({});
    expect(adapter.recognize({ url: 'https://arxiv.org/abs/1706.03762' })).toBe(false);
    await expect(adapter.resolve({ url: 'https://arxiv.org/list/cs.CL/new' })).resolves.toEqual({
      id: 'arxiv:list:cs.CL',
      sourceType: 'arxiv',
      canonicalUrl: 'https://rss.arxiv.org/rss/cs.CL',
      metadata: { kind: 'category', categories: ['cs.CL'] },
    });
    await expect(
      adapter.resolve({ url: 'https://export.arxiv.org/api/query?search_query=au:hinton' }),
    ).resolves.toMatchObject({
      id: 'arxiv:query:au:hinton',
      canonicalUrl: 'https://export.arxiv.org/api/query?search_query=au%3Ahinton',
    });
  });

  it('lists a category feed, skipping replacements, with version-less identities', async () => {
    const { adapter } = collectionAdapter({ 'https://rss.arxiv.org/rss/cs.CL': rss(RSS_CS_CL) });
    const collection = await adapter.resolve({ url: 'https://rss.arxiv.org/rss/cs.CL' });
    const result = await adapter.list(collection, { limit: 10 });

    expect(result.collection.title).toBe('cs.CL updates on arXiv.org');
    expect(result.truncated).toBe(false);
    expect(result.items.map((item) => [item.id, item.metadata.announceType])).toEqual([
      ['arxiv:2610.28673', 'new'],
      ['arxiv:2610.26542', 'cross'],
      ['arxiv:hep-th/9901001', 'new'],
    ]);
    expect(result.items[1]).toEqual({
      id: 'arxiv:2610.26542',
      sourceType: 'arxiv',
      canonicalUrl: 'https://arxiv.org/abs/2610.26542',
      title: 'Breaking Diffusion',
      description: 'The abstract of Breaking Diffusion.',
      publishedAt: '2026-10-22T04:00:00.000Z',
      author: 'Jaesang Yu, Seoyeon Byun, Juho Kim',
      metadata: {
        arxivId: '2610.26542',
        version: 'v1',
        authors: ['Jaesang Yu', 'Seoyeon Byun', 'Juho Kim'],
        categories: ['cs.AI', 'cs.CL'],
        license: 'http://creativecommons.org/licenses/by/4.0/',
        announceType: 'cross',
      },
    });
  });

  it('keeps replacements when asked and bounds the listing', async () => {
    const { adapter } = collectionAdapter(
      { 'https://rss.arxiv.org/rss/cs.CL': rss(RSS_CS_CL) },
      true,
    );
    const collection = await adapter.resolve({ url: 'https://rss.arxiv.org/rss/cs.CL' });
    const result = await adapter.list(collection, { limit: 4 });
    expect(result.items.map((item) => item.metadata.announceType)).toEqual([
      'new',
      'cross',
      'replace',
      'replace-cross',
    ]);
    expect(result.truncated).toBe(true);
    expect(result.items[3]?.metadata.doi).toBe('10.1109/TNNLS.2021.3094304');
    await expect(adapter.list(collection, { limit: 201 })).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it('lists a search query newest first through the API', async () => {
    const query =
      'https://export.arxiv.org/api/query?search_query=abs%3Aretrieval&sortBy=submittedDate&sortOrder=descending&start=0&max_results=2';
    const { adapter, requests } = collectionAdapter({ [query]: atom(API_QUERY) });
    const collection = await adapter.resolve({
      url: 'https://export.arxiv.org/api/query?search_query=abs:retrieval',
    });
    const result = await adapter.list(collection, { limit: 2 });
    expect(requests).toEqual([query]);
    expect(result.items.map((item) => item.id)).toEqual(['arxiv:2610.11111', 'arxiv:2610.22222']);
    expect(result.items[1]?.metadata.primaryCategory).toBe('cs.IR');
    expect(result.truncated).toBe(true);
    expect(result.collection.metadata.totalResults).toBe(1532);
  });

  it('checks the feed content type', async () => {
    const { adapter } = collectionAdapter({ 'https://rss.arxiv.org/rss/cs.CL': html('<html>') });
    const collection = await adapter.resolve({ url: 'https://rss.arxiv.org/rss/cs.CL' });
    await expect(adapter.list(collection, { limit: 1 })).rejects.toThrow(
      'arXiv feed returned unsupported content type',
    );
  });
});

describe('RequestGate', () => {
  it('spaces request starts three seconds apart and runs them one at a time', async () => {
    const { gate, waits, advance } = instantGate();
    const order: number[] = [];
    await Promise.all([
      gate.run(async () => order.push(1)),
      gate.run(async () => order.push(2)),
      gate.run(async () => order.push(3)),
    ]);
    expect(order).toEqual([1, 2, 3]);
    expect(waits).toEqual([3_000, 3_000]);
    advance(10_000);
    await gate.run(async () => undefined);
    expect(waits).toHaveLength(2);
  });

  it('never starts a request while the previous one is still in flight', async () => {
    const { gate } = instantGate();
    let release!: () => void;
    const events: string[] = [];
    const first = gate.run(
      () =>
        new Promise<void>((resolve) => {
          events.push('first start');
          release = () => {
            events.push('first end');
            resolve();
          };
        }),
    );
    const second = gate.run(async () => {
      events.push('second start');
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events).toEqual(['first start']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first start', 'first end', 'second start']);
  });

  it('does not let a cancelled turn block later requests', async () => {
    let clock = 0;
    const gate = new RequestGate(
      3_000,
      () => clock,
      async (ms, signal) => {
        if (signal?.aborted) throw new CancelledError('cancelled');
        clock += ms;
      },
    );
    await gate.run(async () => undefined);
    const controller = new AbortController();
    controller.abort();
    const ran: string[] = [];
    await expect(
      gate.run(async () => ran.push('cancelled'), controller.signal),
    ).rejects.toBeInstanceOf(CancelledError);
    await gate.run(async () => ran.push('next'));
    expect(ran).toEqual(['next']);
  });
});

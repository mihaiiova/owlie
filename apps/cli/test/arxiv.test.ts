import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse, ItemAdapter } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { ArxivCollectionAdapter, ArxivPaperAdapter, RequestGate } from '@owlieio/adapter-arxiv';
import { RssAdapter } from '@owlieio/adapter-rss';
import { paperPdf, arxivFixtures } from '@owlieio/testing';
import { defaultItemAdapters, ExitCode, parseArgs, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const { API_ATTENTION, API_OLD_STYLE, LATEXML_HTML, RSS_CS_CL } = arxivFixtures;

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: true, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

type Route = HttpTextResponse | { pdf: Uint8Array };

function network(routes: Record<string, Route>) {
  const requests: string[] = [];
  const route = (url: string) => {
    const found = routes[url];
    if (!found) throw new ExtractionError(`HTTP 404 Not Found for ${url}`);
    return found;
  };
  const fetcher: HttpFetcher = {
    async fetch(url, options) {
      requests.push(url);
      const found = route(url);
      if ('pdf' in found) {
        const head = new TextDecoder().decode(found.pdf.slice(0, 16));
        options?.stopReading?.(head, 'application/pdf');
        return { url, contentType: 'application/pdf', text: head, partial: true };
      }
      return { ...found, url };
    },
    async fetchBytes(url) {
      requests.push(`bytes ${url}`);
      const found = route(url);
      if (!('pdf' in found)) throw new ExtractionError(`not a PDF: ${url}`);
      return { url, contentType: 'application/pdf', bytes: found.pdf };
    },
  };
  return { fetcher, requests };
}

const api = (id: string) => `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
const atom = (text: string): HttpTextResponse => ({
  url: '',
  contentType: 'application/atom+xml; charset=utf-8',
  text,
});
const html = (text: string): HttpTextResponse => ({ url: '', contentType: 'text/html', text });
const rss = (text: string): HttpTextResponse => ({
  url: '',
  contentType: 'application/rss+xml',
  text,
});

/** The production composition, with the API gate made instant. */
function adapters(fetcher: HttpFetcher, abstractOnly = false): ItemAdapter[] {
  const article = new ArticleAdapter({ fetcher });
  return [
    new ArxivPaperAdapter({ fetcher, article, apiGate: new RequestGate(0), abstractOnly }),
    article,
  ];
}

function deps(routes: Record<string, Route>, abstractOnly = false) {
  const net = network(routes);
  const collection = new ArxivCollectionAdapter({
    fetcher: net.fetcher,
    apiGate: new RequestGate(0),
  });
  const cliDeps: CliDeps = {
    extract: {
      itemAdapters: adapters(net.fetcher, abstractOnly),
      feedAdapter: new RssAdapter({ fetcher: net.fetcher }),
      arxivCollectionAdapter: collection,
      clock: () => new Date('2026-10-22T00:00:00.000Z'),
    },
    list: { arxivAdapter: collection },
  };
  return { deps: cliDeps, requests: net.requests };
}

describe('extract — arXiv papers', () => {
  it('reads the HTML render through the article adapter, with formulas as LaTeX', async () => {
    const { deps: d } = deps({
      [api('1706.03762')]: atom(API_ATTENTION),
      'https://arxiv.org/html/1706.03762': html(LATEXML_HTML),
    });
    const { io, stdout } = capture();
    const code = await run(['extract', 'https://arxiv.org/pdf/1706.03762', '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document).toMatchObject({
      id: 'arxiv:1706.03762',
      sourceType: 'arxiv',
      canonicalUrl: 'https://arxiv.org/abs/1706.03762',
      metadata: { textSource: 'html', version: 'v7' },
      provenance: { adapterId: 'arxiv', warnings: [] },
    });
    expect(document.text).toContain('hidden states $h_{t}$,');
    expect(document.text).toContain('$$\\mathrm{Attention}(Q,K,V)');
    expect(document.text).toContain('$\\beta_{1}=0.9$ and $a<b$');
    expect(document.text.match(/Attention Is All You Need/g)).toHaveLength(1);
    expect(document.text).not.toContain('Equal contribution');
    expect(document.text).not.toContain('thanks:');
  });

  it('falls back to reading the PDF', async () => {
    const { deps: d, requests } = deps({
      [api('hep-th/9901001')]: atom(API_OLD_STYLE),
      'https://arxiv.org/pdf/hep-th/9901001': { pdf: paperPdf() },
    });
    const { io, stdout } = capture();
    const code = await run(['extract', 'https://arxiv.org/abs/hep-th/9901001', '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document.metadata).toMatchObject({ textSource: 'pdf', pageCount: 3 });
    expect(document.text).toContain('We study how text is extracted from documents');
    expect(requests).toContain('bytes https://arxiv.org/pdf/hep-th/9901001');
  });

  it('reads only metadata with --abstract-only', async () => {
    const { deps: d, requests } = deps({ [api('1706.03762')]: atom(API_ATTENTION) }, true);
    const { io, stdout } = capture();
    const code = await run(
      ['extract', 'https://arxiv.org/abs/1706.03762', '--abstract-only', '--json'],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.metadata.textSource).toBe('abstract');
    expect(requests).toEqual([api('1706.03762')]);
  });

  it('keeps --article as the plain article path', async () => {
    const { deps: d, requests } = deps({
      'https://arxiv.org/abs/1706.03762': html(LATEXML_HTML),
    });
    const { io, stdout } = capture();
    const code = await run(
      ['extract', 'https://arxiv.org/abs/1706.03762', '--article', '--json'],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.sourceType).toBe('article');
    expect(requests).toEqual(['https://arxiv.org/abs/1706.03762']);
  });
});

describe('arXiv collections', () => {
  it('lists a category with allowlisted arXiv metadata, skipping replacements', async () => {
    const { deps: d } = deps({ 'https://rss.arxiv.org/rss/cs.CL': rss(RSS_CS_CL) });
    const { io, stdout } = capture();
    const code = await run(['list', 'https://arxiv.org/list/cs.CL/new', '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection).toMatchObject({
      id: 'arxiv:list:cs.CL',
      sourceType: 'arxiv',
      title: 'cs.CL updates on arXiv.org',
    });
    expect(envelope.items).toHaveLength(3);
    expect(envelope.items[1]).toEqual({
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
        announceType: 'cross',
        authors: ['Jaesang Yu', 'Seoyeon Byun', 'Juho Kim'],
        categories: ['cs.AI', 'cs.CL'],
        license: 'http://creativecommons.org/licenses/by/4.0/',
      },
    });
  });

  it('extracts the papers of a category feed as a batch', async () => {
    const { deps: d } = deps({
      'https://rss.arxiv.org/rss/cs.CL': rss(RSS_CS_CL),
      [api('2610.28673')]: atom(API_ATTENTION.replaceAll('1706.03762', '2610.28673')),
      'https://arxiv.org/html/2610.28673': html(LATEXML_HTML),
    });
    const { io, stdout } = capture();
    const code = await run(
      ['extract', 'https://rss.arxiv.org/rss/cs.CL', '--limit', '1', '--json'],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection.id).toBe('arxiv:list:cs.CL');
    expect(envelope.truncated).toBe(true);
    expect(envelope.items[0].document).toMatchObject({
      id: 'arxiv:2610.28673',
      sourceType: 'arxiv',
      metadata: { textSource: 'html' },
    });
  });
});

describe('arXiv flag usage', () => {
  it.each([
    [
      ['extract', 'https://example.com/post', '--abstract-only'],
      '--abstract-only applies to arXiv',
    ],
    [
      ['extract', 'https://arxiv.org/abs/1706.03762', '--include-replacements'],
      '--include-replacements applies to arXiv category feeds',
    ],
    [
      ['list', 'https://export.arxiv.org/api/query?search_query=au:x', '--include-replacements'],
      '--include-replacements applies to arXiv category feeds',
    ],
    [
      ['list', 'https://rss.arxiv.org/rss/cs.CL', '--order', 'newest'],
      '--order applies to RSS/Atom feeds, not arXiv',
    ],
    [
      ['list', 'https://rss.arxiv.org/rss/cs.CL', '--abstract-only'],
      '--abstract-only applies to extract',
    ],
  ])('rejects %j', async (argv, message) => {
    const { io, stderr } = capture();
    expect(await run(argv, io, {})).toBe(ExitCode.Usage);
    expect(stderr()).toContain(message);
  });

  it('parses the arXiv flags', () => {
    expect(
      parseArgs(['extract', 'x', '--abstract-only', '--include-replacements']).options,
    ).toMatchObject({
      abstractOnly: true,
      includeReplacements: true,
    });
  });

  it('puts the arXiv adapter ahead of podcast pages and the article fallback', () => {
    expect(defaultItemAdapters().map((adapter) => adapter.id)).toEqual([
      'youtube',
      'hackernews',
      'arxiv',
      'podcast',
      'article',
    ]);
  });
});

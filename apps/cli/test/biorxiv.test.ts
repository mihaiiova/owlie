import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse, ItemAdapter } from '@owlieio/core';
import { ExtractionError, RequestGate } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { BiorxivCollectionAdapter, BiorxivPaperAdapter } from '@owlieio/adapter-biorxiv';
import { RssAdapter } from '@owlieio/adapter-rss';
import { biorxivFixtures, paperPdf } from '@owlieio/testing';
import { ADAPTER_IDS, ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const { ABSTRACT_ONLY_HTML, DETAILS_TWO_VERSIONS, FULL_TEXT_HTML, details, record } =
  biorxivFixtures;

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

const json = (text: string): HttpTextResponse => ({
  url: '',
  contentType: 'application/json',
  text,
});
const html = (text: string): HttpTextResponse => ({ url: '', contentType: 'text/html', text });

const API = 'https://api.biorxiv.org';
const DOI = '10.64898/2026.08.27.747565';
const PAPER = `https://www.biorxiv.org/content/${DOI}`;
const NOW = Date.UTC(2026, 9, 28, 12);
const WINDOW = '2026-10-15/2026-10-28';

/** The production composition, with the gates made instant. */
function adapters(fetcher: HttpFetcher, abstractOnly = false): ItemAdapter[] {
  const article = new ArticleAdapter({ fetcher });
  return [
    new BiorxivPaperAdapter({
      fetcher,
      article,
      apiGate: new RequestGate(0),
      pageGate: new RequestGate(0),
      abstractOnly,
    }),
    article,
  ];
}

function deps(routes: Record<string, Route>, abstractOnly = false) {
  const net = network(routes);
  const collection = new BiorxivCollectionAdapter({
    fetcher: net.fetcher,
    apiGate: new RequestGate(0),
    pageGate: new RequestGate(0),
    now: () => NOW,
  });
  const cliDeps: CliDeps = {
    extract: {
      itemAdapters: adapters(net.fetcher, abstractOnly),
      feedAdapter: new RssAdapter({ fetcher: net.fetcher }),
      biorxivCollectionAdapter: collection,
      clock: () => new Date('2026-10-28T00:00:00.000Z'),
    },
    list: { biorxivAdapter: collection },
  };
  return { deps: cliDeps, requests: net.requests };
}

describe('extract — bioRxiv/medRxiv preprints', () => {
  it('registers the adapter', () => {
    expect(ADAPTER_IDS).toContain('biorxiv');
  });

  it('reads the full-text page through the article adapter, without references', async () => {
    const { deps: d } = deps({
      [`${API}/details/biorxiv/${DOI}`]: json(DETAILS_TWO_VERSIONS),
      [`${PAPER}v2.full`]: html(FULL_TEXT_HTML),
    });
    const { io, stdout } = capture();
    const code = await run(['extract', `${PAPER}v2.full.pdf`, '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document).toMatchObject({
      id: `biorxiv:${DOI}`,
      sourceType: 'biorxiv',
      canonicalUrl: PAPER,
      metadata: { textSource: 'html', version: 2, server: 'biorxiv' },
      provenance: { adapterId: 'biorxiv', warnings: [] },
    });
    expect(document.text).toContain('INTRODUCTION');
    expect(document.text).toContain('rhesus macaques');
    expect(document.text).not.toContain('REFERENCES');
    expect(document.text).not.toContain('Safrit');
  });

  it('falls back to reading the PDF when the page has no body yet', async () => {
    const { deps: d, requests } = deps({
      [`${API}/details/biorxiv/${DOI}`]: json(DETAILS_TWO_VERSIONS),
      [`${PAPER}v2.full`]: html(ABSTRACT_ONLY_HTML),
      [`${PAPER}v2.full.pdf`]: { pdf: paperPdf() },
    });
    const { io, stdout } = capture();
    const code = await run(['extract', PAPER, '--json'], io, d);

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document.metadata).toMatchObject({ textSource: 'pdf', pageCount: 3 });
    expect(requests).toContain(`bytes ${PAPER}v2.full.pdf`);
  });

  it('reads only metadata with --abstract-only', async () => {
    const { deps: d, requests } = deps(
      { [`${API}/details/biorxiv/${DOI}`]: json(DETAILS_TWO_VERSIONS) },
      true,
    );
    const { io, stdout } = capture();
    const code = await run(['extract', PAPER, '--abstract-only', '--json'], io, d);
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.metadata.textSource).toBe('abstract');
    expect(requests).toEqual([`${API}/details/biorxiv/${DOI}`]);
  });
});

describe('bioRxiv/medRxiv collections', () => {
  const listing = details(
    [
      record({ doi: '10.64898/2026.10.20.700001', title: 'Older', date: '2026-10-20' }),
      record({ doi: '10.64898/2026.10.25.700002', title: 'Newer', date: '2026-10-26' }),
    ],
    { status: 'ok', category: 'neuroscience', total: 2 },
  );
  const listUrl = `${API}/details/biorxiv/${WINDOW}/0?category=neuroscience`;

  it('lists a subject newest first with allowlisted metadata', async () => {
    const { deps: d } = deps({ [listUrl]: json(listing) });
    const { io, stdout } = capture();
    const code = await run(
      ['list', 'https://www.biorxiv.org/collection/neuroscience', '--json'],
      io,
      d,
    );

    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection).toMatchObject({
      id: 'biorxiv:collection:biorxiv:neuroscience',
      sourceType: 'biorxiv',
      title: 'bioRxiv · Neuroscience',
    });
    expect(envelope.items.map((item: { title: string }) => item.title)).toEqual(['Newer', 'Older']);
    expect(envelope.items[0]).toEqual({
      id: 'biorxiv:10.64898/2026.10.25.700002',
      sourceType: 'biorxiv',
      canonicalUrl: 'https://www.biorxiv.org/content/10.64898/2026.10.25.700002',
      title: 'Newer',
      description: 'The brain is the central processing center that integrates information.',
      publishedAt: '2026-10-26',
      author: 'Cabanas, N., Veloso, A., Zinzen, R., Bucher, G.',
      metadata: {
        doi: '10.64898/2026.10.25.700002',
        server: 'biorxiv',
        version: 1,
        authors: ['Cabanas, N.', 'Veloso, A.', 'Zinzen, R.', 'Bucher, G.'],
        category: 'neuroscience',
        articleType: 'new results',
        license: 'cc_no',
      },
    });
  });

  it('extracts the preprints of a subject as a batch', async () => {
    const newer = '10.64898/2026.10.25.700002';
    const { deps: d } = deps(
      {
        [listUrl]: json(listing),
        [`${API}/details/biorxiv/${newer}`]: json(
          details([record({ doi: newer, title: 'Newer' })]),
        ),
      },
      true,
    );
    const { io, stdout } = capture();
    const code = await run(
      [
        'extract',
        'https://www.biorxiv.org/collection/neuroscience',
        '--limit',
        '1',
        '--abstract-only',
        '--json',
      ],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection.id).toBe('biorxiv:collection:biorxiv:neuroscience');
    expect(envelope.truncated).toBe(true);
    expect(envelope.items[0].document).toMatchObject({
      id: `biorxiv:${newer}`,
      sourceType: 'biorxiv',
      metadata: { textSource: 'abstract' },
    });
  });

  it('explains an unknown subject instead of reading the page', async () => {
    const { deps: d, requests } = deps({});
    const { io, stderr } = capture();
    const code = await run(['list', 'https://www.biorxiv.org/collection/astrology'], io, d);
    expect(code).not.toBe(ExitCode.Success);
    expect(stderr()).toContain('unknown bioRxiv/medRxiv subject');
    expect(requests).toEqual([]);
  });

  it.each([
    [
      ['list', 'https://www.biorxiv.org/collection/neuroscience', '--order', 'newest'],
      '--order applies to RSS/Atom feeds, not arXiv, bioRxiv/medRxiv',
    ],
    [
      ['extract', 'https://example.com/post', '--include-replacements'],
      'bioRxiv/medRxiv collections',
    ],
  ])('rejects %j', async (argv, message) => {
    const { io, stderr } = capture();
    expect(await run(argv, io, {})).toBe(ExitCode.Usage);
    expect(stderr()).toContain(message);
  });

  it('accepts the paper flags on bioRxiv URLs', async () => {
    const { deps: d } = deps({ [listUrl]: json(listing) });
    const { io } = capture();
    expect(
      await run(
        [
          'list',
          'https://www.biorxiv.org/collection/neuroscience',
          '--include-replacements',
          '--json',
        ],
        io,
        d,
      ),
    ).toBe(ExitCode.Success);
  });
});

import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { CancelledError, ConfigurationError, ExtractionError, RequestGate } from '@owlieio/core';
import {
  PUBMED_ABSTRACT_ONLY,
  PUBMED_FILTER_IGNORED,
  PUBMED_NO_CONTACT,
  PUBMED_RETRACTED,
  PubmedArticleAdapter,
  PubmedSearchAdapter,
} from '@owlieio/adapter-pubmed';
import { pubmedFixtures } from '@owlieio/testing';
import { collectionAdapterContract, itemAdapterContract } from '@owlieio/testing/contract-tests';

const {
  ALPHAFOLD_ARTICLE,
  EMPTY_SET,
  RETRACTED_ARTICLE,
  esearch,
  esummary,
  idconv,
  pmcArticle,
  pmcSet,
  pubmedSet,
  summaryRecord,
} = pubmedFixtures;

const XML = 'text/xml; charset=UTF-8';
const JSON_TYPE = 'application/json; charset=UTF-8';
const EMAIL = 'research@example.org';

/** A fake NCBI: routes by endpoint and parameters, recording every request URL. */
function network(routes: Record<string, HttpTextResponse | { status: number }>) {
  const requests: URL[] = [];
  const fetcher: HttpFetcher = {
    async fetch(url) {
      const parsed = new URL(url);
      requests.push(parsed);
      const params = parsed.searchParams;
      const key = parsed.pathname.endsWith('/idconv/api/v1/articles/')
        ? `idconv ${params.get('ids')}`
        : `${parsed.pathname.split('/').pop()!.replace('.fcgi', '')} ${params.get('db')} ${params.get('id') ?? params.get('term')}`;
      const route = routes[key];
      if (!route)
        throw new ExtractionError(`HTTP 404 Not Found for ${key}`, {
          details: { httpStatus: 404 },
        });
      if ('status' in route)
        throw new ExtractionError(`HTTP ${route.status} for ${key}`, {
          details: { httpStatus: route.status },
        });
      return { ...route, url };
    },
  };
  return { fetcher, requests };
}

const xml = (text: string): HttpTextResponse => ({ url: '', contentType: XML, text });
const json = (text: string): HttpTextResponse => ({ url: '', contentType: JSON_TYPE, text });

function articleAdapter(
  routes: Record<string, HttpTextResponse | { status: number }>,
  options: { abstractOnly?: boolean; contactEmail?: string; apiKey?: string } = {
    contactEmail: EMAIL,
  },
) {
  const net = network(routes);
  const adapter = new PubmedArticleAdapter({
    fetcher: net.fetcher,
    gate: new RequestGate(0),
    ...options,
  });
  return { adapter, requests: net.requests };
}

async function extract(adapter: PubmedArticleAdapter, url: string) {
  return adapter.extract(await adapter.resolveItem({ url }));
}

const ALPHAFOLD = {
  'efetch pubmed 34265844': xml(pubmedSet(ALPHAFOLD_ARTICLE)),
  'efetch pmc PMC8371605': xml(pmcSet(pmcArticle())),
};

describe('PubmedArticleAdapter', () => {
  it('recognizes article URLs and resolves PubMed URLs without the network', async () => {
    const { adapter, requests } = articleAdapter({});
    expect(adapter.recognize({ url: 'https://europepmc.org/article/MED/34265844' })).toBe(true);
    expect(adapter.recognize({ url: 'https://pubmed.ncbi.nlm.nih.gov/?term=x' })).toBe(false);
    await expect(
      adapter.resolveItem({ url: 'https://pubmed.ncbi.nlm.nih.gov/34265844' }),
    ).resolves.toEqual({
      id: 'pubmed:34265844',
      sourceType: 'pubmed',
      canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/34265844/',
      metadata: { pmid: '34265844' },
    });
    expect(requests).toEqual([]);
    await expect(adapter.resolveItem({ url: 'https://example.com/' })).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it('reads the PMC full text behind a header from PubMed, identified to NCBI', async () => {
    const { adapter, requests } = articleAdapter(ALPHAFOLD);
    const document = await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/');

    expect(requests.map((url) => url.searchParams.get('db'))).toEqual(['pubmed', 'pmc']);
    for (const url of requests) {
      expect(url.searchParams.get('tool')).toBe('owlie');
      expect(url.searchParams.get('email')).toBe(EMAIL);
      expect(url.searchParams.has('api_key')).toBe(false);
    }
    expect(document).toMatchObject({
      id: 'pubmed:34265844',
      sourceType: 'pubmed',
      canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/34265844/',
      title: 'Highly accurate protein structure prediction with AlphaFold.',
      author: 'John Jumper, Augustin Žídek, Demis Hassabis',
      publishedAt: '2021-07-15',
      metadata: {
        pmid: '34265844',
        pmcid: 'PMC8371605',
        doi: '10.1038/s41586-021-03819-2',
        journal: 'Nature',
        meshHeadings: ['Protein Folding', 'Deep Learning'],
        pmcUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/',
        textSource: 'pmc',
      },
      provenance: { adapterId: 'pubmed', sourceId: 'pubmed:34265844', warnings: [] },
    });
    expect(
      document.text.startsWith(
        'Highly accurate protein structure prediction with AlphaFold.\n\nJohn Jumper, Augustin Žídek, Demis Hassabis\n\nNature, 2021-07-15\n\nAbstract\n\nProteins are essential',
      ),
    ).toBe(true);
    expect(document.text).toContain('\n\nMain\n\n');
    expect(document.metadata).not.toHaveProperty('retracted');
  });

  it('gives a PMC URL the same identity, through the ID converter', async () => {
    const { adapter, requests } = articleAdapter({
      ...ALPHAFOLD,
      'idconv PMC8371605': json(idconv('PMC8371605', { pmid: 34265844 })),
    });
    const document = await extract(adapter, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/');
    expect(requests[0]!.pathname).toBe('/tools/idconv/api/v1/articles/');
    expect(requests[0]!.searchParams.get('email')).toBe(EMAIL);
    expect(document.id).toBe('pubmed:34265844');
    expect(document.canonicalUrl).toBe('https://pubmed.ncbi.nlm.nih.gov/34265844/');
  });

  it('reads a PMC article that has no PMID from its JATS front', async () => {
    const { adapter } = articleAdapter({
      'idconv PMC8371605': json(idconv('PMC8371605', {})),
      'efetch pmc PMC8371605': xml(pmcSet(pmcArticle({ pmid: '' }))),
    });
    const document = await extract(adapter, 'https://europepmc.org/article/PMC/PMC8371605');
    expect(document).toMatchObject({
      id: 'pubmed:PMC8371605',
      canonicalUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/',
      title: 'Highly accurate protein structure prediction with AlphaFold',
      metadata: { pmcid: 'PMC8371605', textSource: 'pmc' },
    });
  });

  it('fails for unknown articles', async () => {
    const { adapter } = articleAdapter({
      'efetch pubmed 999999999': xml(EMPTY_SET),
      'idconv PMC99999999': json(idconv('PMC99999999', { status: 'error' })),
    });
    await expect(extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/999999999/')).rejects.toThrow(
      'PubMed article 999999999 not found',
    );
    await expect(
      extract(adapter, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC99999999/'),
    ).rejects.toThrow('PMC article PMC99999999 not found');
  });

  it('returns the abstract of a retracted article with no PMC copy, with warnings', async () => {
    const { adapter, requests } = articleAdapter({
      'efetch pubmed 9500320': xml(pubmedSet(RETRACTED_ARTICLE)),
    });
    const document = await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/9500320/');
    expect(requests).toHaveLength(1);
    expect(document.metadata).toMatchObject({ textSource: 'abstract', retracted: true });
    expect(document.text).toContain('Abstract\n\nBACKGROUND\n\nWe investigated');
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      PUBMED_RETRACTED,
      PUBMED_ABSTRACT_ONLY,
    ]);
  });

  it('falls back to the abstract when PMC withholds the body', async () => {
    const { adapter } = articleAdapter({
      'efetch pubmed 34265844': xml(pubmedSet(ALPHAFOLD_ARTICLE)),
      'efetch pmc PMC8371605': xml(pmcSet(pmcArticle({ body: false }))),
    });
    const document = await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/');
    expect(document.metadata.textSource).toBe('abstract');
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      PUBMED_ABSTRACT_ONLY,
    ]);
  });

  it('fails instead of returning the abstract when PMC is rate limiting', async () => {
    const { adapter } = articleAdapter({
      'efetch pubmed 34265844': xml(pubmedSet(ALPHAFOLD_ARTICLE)),
      'efetch pmc PMC8371605': { status: 429 },
    });
    const error = await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).details).toEqual({ httpStatus: 429 });
  });

  it('reads PubMed only with abstractOnly, and warns about nothing', async () => {
    const { adapter, requests } = articleAdapter(ALPHAFOLD, {
      abstractOnly: true,
      contactEmail: EMAIL,
    });
    const document = await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/');
    expect(requests).toHaveLength(1);
    expect(document.metadata.textSource).toBe('abstract');
    expect(document.provenance.warnings).toEqual([]);
  });

  it('warns without a contact email, and sends the API key when set', async () => {
    const { adapter, requests } = articleAdapter(ALPHAFOLD, { apiKey: 'ncbitestkey' });
    const document = await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/');
    expect(requests[0]!.searchParams.has('email')).toBe(false);
    expect(requests[0]!.searchParams.get('api_key')).toBe('ncbitestkey');
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      PUBMED_NO_CONTACT,
    ]);
  });

  it('checks content types before parsing', async () => {
    const { adapter } = articleAdapter({
      'efetch pubmed 34265844': { url: '', contentType: 'text/html', text: '<html></html>' },
    });
    await expect(extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/')).rejects.toThrow(
      'NCBI efetch returned unsupported content type: text/html',
    );
    const converter = articleAdapter({
      'idconv PMC8371605': { url: '', contentType: 'text/html', text: '<html></html>' },
    });
    await expect(
      extract(converter.adapter, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/'),
    ).rejects.toThrow('PMC ID converter returned unsupported content type: text/html');
  });

  it('returns the abstract of a PMC article that has no PMID and no body', async () => {
    const { adapter } = articleAdapter({
      'idconv PMC8371605': json(idconv('PMC8371605', {})),
      'efetch pmc PMC8371605': xml(pmcSet(pmcArticle({ pmid: '', body: false }))),
    });
    const document = await extract(adapter, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/');
    expect(document.metadata.textSource).toBe('abstract');
    expect(document.text).toContain('Proteins are essential to life.');
    expect(document.provenance.warnings.map((warning) => warning.code)).toEqual([
      PUBMED_ABSTRACT_ONLY,
    ]);
  });

  it('reads an item without ids from its URL, and refuses other items', async () => {
    const { adapter } = articleAdapter(ALPHAFOLD);
    const item = {
      id: 'pubmed:34265844',
      sourceType: 'pubmed' as const,
      canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/34265844/',
      metadata: {},
    };
    await expect(adapter.extract(item)).resolves.toMatchObject({ id: 'pubmed:34265844' });
    await expect(
      adapter.extract({ ...item, canonicalUrl: 'https://example.com/paper' }),
    ).rejects.toThrow('not a PubMed article: https://example.com/paper');
  });

  it('propagates cancellation instead of falling back', async () => {
    const controller = new AbortController();
    const fetcher: HttpFetcher = {
      async fetch(url) {
        if (url.includes('db=pmc')) {
          controller.abort();
          throw new CancelledError('cancelled');
        }
        return { url, contentType: XML, text: pubmedSet(ALPHAFOLD_ARTICLE) };
      },
    };
    const adapter = new PubmedArticleAdapter({
      fetcher,
      gate: new RequestGate(0),
      contactEmail: EMAIL,
    });
    const item = await adapter.resolveItem({ url: 'https://pubmed.ncbi.nlm.nih.gov/34265844/' });
    await expect(adapter.extract(item, { signal: controller.signal })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  it('spaces requests with the gate', async () => {
    let clock = 0;
    const waits: number[] = [];
    const gate = new RequestGate(
      334,
      () => clock,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    );
    const net = network(ALPHAFOLD);
    const adapter = new PubmedArticleAdapter({ fetcher: net.fetcher, gate, contactEmail: EMAIL });
    await extract(adapter, 'https://pubmed.ncbi.nlm.nih.gov/34265844/');
    expect(waits).toEqual([334]);
  });
});

const QUERY = '"GLP-1" AND "alcohol use disorder"';
const SEARCH_URL = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(QUERY)}`;

function searchAdapter(routes: Record<string, HttpTextResponse>) {
  const net = network(routes);
  return {
    adapter: new PubmedSearchAdapter({
      fetcher: net.fetcher,
      gate: new RequestGate(0),
      contactEmail: EMAIL,
    }),
    requests: net.requests,
  };
}

describe('PubmedSearchAdapter', () => {
  const routes = {
    [`esearch pubmed ${QUERY}`]: json(esearch(['42750843', '42750798'], 142)),
    'esummary pubmed 42750843,42750798': json(
      esummary(['42750843', '42750798'], {
        '42750843': summaryRecord('42750843'),
        '42750798': summaryRecord('42750798', { title: 'Second', articleids: [] }),
      }),
    ),
  };

  it('resolves a search to a stable identity', async () => {
    const { adapter } = searchAdapter({});
    await expect(adapter.resolve({ url: SEARCH_URL })).resolves.toEqual({
      id: 'pubmed:search:"glp-1" and "alcohol use disorder"',
      sourceType: 'pubmed',
      canonicalUrl:
        'https://pubmed.ncbi.nlm.nih.gov/?term=%22GLP-1%22+AND+%22alcohol+use+disorder%22',
      title: `PubMed: ${QUERY}`,
      metadata: { kind: 'search', query: QUERY },
    });
    const filtered = await adapter.resolve({ url: `${SEARCH_URL}&filter=lang.english` });
    expect(filtered.metadata).toMatchObject({
      ignoredFilters: ['lang.english'],
      warnings: [{ code: PUBMED_FILTER_IGNORED }],
    });
  });

  it('lists the newest articles by publication date', async () => {
    const { adapter, requests } = searchAdapter(routes);
    const collection = await adapter.resolve({ url: SEARCH_URL });
    const result = await adapter.list(collection, { limit: 2 });

    expect(requests[0]!.searchParams.get('sort')).toBe('pub_date');
    expect(requests[0]!.searchParams.get('retmax')).toBe('2');
    expect(result.items.map((item) => item.id)).toEqual(['pubmed:42750843', 'pubmed:42750798']);
    expect(result.items[0]).toEqual({
      id: 'pubmed:42750843',
      sourceType: 'pubmed',
      canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/42750843/',
      title: 'Co-treating opioid and alcohol use disorders in the GLP-1 era.',
      publishedAt: '2026-09-02',
      author: 'Qeadan F, Barbeau WA',
      metadata: {
        pmid: '42750843',
        pmcid: 'PMC13578398',
        doi: '10.1016/j.dadr.2026.100474',
        authors: ['Qeadan F', 'Barbeau WA'],
        journal: 'Drug and alcohol dependence reports',
        publicationTypes: ['Journal Article', 'Review'],
      },
    });
    expect(result.truncated).toBe(true);
    expect(result.collection.metadata.totalResults).toBe(142);
  });

  it('makes one request for an empty search', async () => {
    const { adapter, requests } = searchAdapter({ 'esearch pubmed nothing': json(esearch([], 0)) });
    const collection = await adapter.resolve({
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=nothing',
    });
    await expect(adapter.list(collection, { limit: 5 })).resolves.toMatchObject({
      items: [],
      truncated: false,
    });
    expect(requests).toHaveLength(1);
  });

  it('bounds the listing', async () => {
    const { adapter } = searchAdapter({});
    const collection = await adapter.resolve({ url: SEARCH_URL });
    await expect(adapter.list(collection, { limit: 201 })).rejects.toThrow();
  });

  it('refuses a collection without a query, and checks the search content type', async () => {
    const { adapter } = searchAdapter({
      [`esearch pubmed ${QUERY}`]: { url: '', contentType: 'text/html', text: '<html></html>' },
    });
    const collection = await adapter.resolve({ url: SEARCH_URL });
    await expect(adapter.list({ ...collection, metadata: {} }, { limit: 5 })).rejects.toThrow(
      'not a PubMed search',
    );
    await expect(adapter.list(collection, { limit: 5 })).rejects.toThrow(
      'NCBI esearch returned unsupported content type: text/html',
    );
  });
});

collectionAdapterContract(
  'PubmedSearchAdapter',
  () =>
    searchAdapter({
      'esearch pubmed sepsis': json(esearch(['42750843'], 1)),
      'esummary pubmed 42750843': json(
        esummary(['42750843'], { '42750843': summaryRecord('42750843') }),
      ),
    }).adapter,
  { url: 'https://pubmed.ncbi.nlm.nih.gov/?term=sepsis' },
);

itemAdapterContract('PubmedArticleAdapter', () => articleAdapter(ALPHAFOLD).adapter, {
  url: 'https://pubmed.ncbi.nlm.nih.gov/34265844/',
});

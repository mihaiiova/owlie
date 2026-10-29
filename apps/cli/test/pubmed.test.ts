import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { ExtractionError, RequestGate } from '@owlieio/core';
import { PubmedArticleAdapter, PubmedSearchAdapter } from '@owlieio/adapter-pubmed';
import { pubmedFixtures } from '@owlieio/testing';
import { ADAPTER_IDS, ExitCode, resolveNcbiSettings, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const { ALPHAFOLD_ARTICLE, esearch, esummary, pmcArticle, pmcSet, pubmedSet, summaryRecord } =
  pubmedFixtures;

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

function network(routes: Record<string, HttpTextResponse>) {
  const requests: URL[] = [];
  const fetcher: HttpFetcher = {
    async fetch(url) {
      const parsed = new URL(url);
      requests.push(parsed);
      const p = parsed.searchParams;
      const key = `${parsed.pathname.split('/').pop()!.replace('.fcgi', '')} ${p.get('db')} ${p.get('id') ?? p.get('term')}`;
      const route = routes[key];
      if (!route) throw new ExtractionError(`HTTP 404 Not Found for ${key}`);
      return { ...route, url };
    },
  };
  return { fetcher, requests };
}

const xml = (text: string): HttpTextResponse => ({ url: '', contentType: 'text/xml', text });
const json = (text: string): HttpTextResponse => ({
  url: '',
  contentType: 'application/json',
  text,
});

const ROUTES = {
  'efetch pubmed 34265844': xml(pubmedSet(ALPHAFOLD_ARTICLE)),
  'efetch pmc PMC8371605': xml(pmcSet(pmcArticle())),
  'esearch pubmed sepsis': json(esearch(['34265844'], 9)),
  'esummary pubmed 34265844': json(
    esummary(['34265844'], { '34265844': summaryRecord('34265844') }),
  ),
};

function deps(abstractOnly = false) {
  const net = network(ROUTES);
  const options = { fetcher: net.fetcher, gate: new RequestGate(0), contactEmail: 'a@example.org' };
  const search = new PubmedSearchAdapter(options);
  const cliDeps: CliDeps = {
    extract: {
      itemAdapters: [new PubmedArticleAdapter({ ...options, abstractOnly })],
      pubmedSearchAdapter: search,
      clock: () => new Date('2026-10-28T00:00:00.000Z'),
    },
    list: { pubmedAdapter: search },
  };
  return { deps: cliDeps, requests: net.requests };
}

describe('PubMed through the CLI', () => {
  it('registers the adapter', () => {
    expect(ADAPTER_IDS).toContain('pubmed');
  });

  it('extracts an article with its PMC full text', async () => {
    const { deps: d } = deps();
    const { io, stdout } = capture();
    const code = await run(
      ['extract', 'https://pubmed.ncbi.nlm.nih.gov/34265844/', '--json'],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result).toMatchObject({
      id: 'pubmed:34265844',
      sourceType: 'pubmed',
      metadata: { textSource: 'pmc', pmcid: 'PMC8371605' },
    });
  });

  it('lists a search with allowlisted metadata', async () => {
    const { deps: d } = deps();
    const { io, stdout } = capture();
    const code = await run(
      ['list', 'https://pubmed.ncbi.nlm.nih.gov/?term=sepsis', '--json'],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection).toMatchObject({ id: 'pubmed:search:sepsis', sourceType: 'pubmed' });
    expect(envelope.truncated).toBe(true);
    expect(envelope.items[0].metadata).toEqual({
      pmid: '34265844',
      pmcid: 'PMC13578398',
      doi: '10.1016/j.dadr.2026.100474',
      authors: ['Qeadan F', 'Barbeau WA'],
      journal: 'Drug and alcohol dependence reports',
      publicationTypes: ['Journal Article', 'Review'],
    });
  });

  it('extracts the articles of a search as a batch', async () => {
    const { deps: d } = deps(true);
    const { io, stdout } = capture();
    const code = await run(
      ['extract', 'https://pubmed.ncbi.nlm.nih.gov/?term=sepsis', '--abstract-only', '--json'],
      io,
      d,
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.items[0].document).toMatchObject({
      id: 'pubmed:34265844',
      metadata: { textSource: 'abstract' },
    });
  });

  it.each([
    [
      ['list', 'https://pubmed.ncbi.nlm.nih.gov/?term=x', '--order', 'newest'],
      'PubMed collections',
    ],
    [
      ['doctor', '--contact-email', 'a@example.org'],
      '--contact-email applies to extract, list and process',
    ],
    [
      ['models', '--ncbi-api-key', 'ncbitestkey'],
      '--ncbi-api-key applies to extract, list and process',
    ],
  ])('rejects %j', async (argv, message) => {
    const { io, stderr } = capture();
    expect(await run(argv, io, {})).toBe(ExitCode.Usage);
    expect(stderr()).toContain(message);
  });
});

describe('resolveNcbiSettings', () => {
  const files = (values: Record<string, string>) => (path: string) =>
    path === '.env' ? values : {};

  it('prefers the flag, then process env, then env files', () => {
    expect(
      resolveNcbiSettings(
        { contactEmail: 'flag@example.org' },
        { OWLIE_CONTACT_EMAIL: 'env@example.org' },
        files({}),
      ),
    ).toEqual({ contactEmail: 'flag@example.org' });
    expect(
      resolveNcbiSettings(
        {},
        {},
        files({ OWLIE_CONTACT_EMAIL: 'file@example.org', OWLIE_NCBI_API_KEY: 'ncbitestkey' }),
      ),
    ).toEqual({ contactEmail: 'file@example.org', apiKey: 'ncbitestkey' });
  });

  it('reads no env files in hosted mode', () => {
    expect(
      resolveNcbiSettings({ hosted: true }, {}, files({ OWLIE_CONTACT_EMAIL: 'file@example.org' })),
    ).toEqual({});
  });

  it('rejects invalid values without echoing them', () => {
    expect(() => resolveNcbiSettings({ contactEmail: 'not-an-email' }, {}, files({}))).toThrow(
      '--contact-email (or OWLIE_CONTACT_EMAIL) must be an email address',
    );
    expect(() => resolveNcbiSettings({ ncbiApiKey: 'bad key!' }, {}, files({}))).toThrow(
      /^(?!.*bad key)/,
    );
  });
});

/**
 * Pure, network-free recognition of PubMed, PubMed Central and Europe PMC
 * article URLs, and of PubMed search URLs.
 */

/** An article reference: a PMID, or a PMCID when the URL names a PMC copy. */
export type PubmedArticleRef = { kind: 'pmid'; pmid: string } | { kind: 'pmcid'; pmcid: string };

/** A PubMed search: the effective E-utilities query, and any filters it could not translate. */
export interface PubmedSearchRef {
  /** The query sent to `esearch` (the `term`, plus translated filters). */
  query: string;
  /** `filter=` values that have no query equivalent and were ignored. */
  ignoredFilters: string[];
}

const PMID = /^\d{1,9}$/;
const PMCID = /^PMC(\d{1,9})$/i;

function parseUrl(input: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  return url;
}

function segments(url: URL): string[] {
  return url.pathname.split('/').filter((segment) => segment !== '');
}

function pmcRef(value: string | undefined): PubmedArticleRef | undefined {
  const match = PMCID.exec(value ?? '');
  return match ? { kind: 'pmcid', pmcid: `PMC${match[1]!}` } : undefined;
}

function pmidRef(value: string | undefined): PubmedArticleRef | undefined {
  return value !== undefined && PMID.test(value)
    ? { kind: 'pmid', pmid: String(Number(value)) }
    : undefined;
}

/**
 * Recognizes an article URL:
 * - `pubmed.ncbi.nlm.nih.gov/<pmid>[/]` (and the legacy `www.ncbi.nlm.nih.gov/pubmed/<pmid>`)
 * - `pmc.ncbi.nlm.nih.gov/articles/PMC<id>[/]` and `www.ncbi.nlm.nih.gov/pmc/articles/PMC<id>[/]`
 * - `europepmc.org/article/MED/<pmid>` and `europepmc.org/article/PMC/PMC<id>`
 */
export function parsePubmedArticleUrl(input: string): PubmedArticleRef | undefined {
  const url = parseUrl(input);
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  const parts = segments(url);
  if (host === 'pubmed.ncbi.nlm.nih.gov') {
    return parts.length === 1 ? pmidRef(parts[0]) : undefined;
  }
  if (host === 'pmc.ncbi.nlm.nih.gov') {
    return parts.length === 2 && parts[0] === 'articles' ? pmcRef(parts[1]) : undefined;
  }
  if (host === 'www.ncbi.nlm.nih.gov' || host === 'ncbi.nlm.nih.gov') {
    if (parts.length === 2 && parts[0] === 'pubmed') return pmidRef(parts[1]);
    if (parts.length === 3 && parts[0] === 'pmc' && parts[1] === 'articles')
      return pmcRef(parts[2]);
    return undefined;
  }
  if (host === 'europepmc.org' || host === 'www.europepmc.org') {
    if (parts.length !== 3 || parts[0]?.toLowerCase() !== 'article') return undefined;
    const source = parts[1]!.toUpperCase();
    if (source === 'MED') return pmidRef(parts[2]);
    if (source === 'PMC') return pmcRef(parts[2]);
  }
  return undefined;
}

/** PubMed `filter=` values with a query equivalent (checked against esearch on 2026-10-28). */
const FILTERS: Record<string, string> = {
  'simsearch1.fha': 'hasabstract',
  'simsearch2.ffrft': 'ffrft[Filter]',
  'simsearch3.fft': 'fft[Filter]',
  'pubt.clinicaltrial': '"clinical trial"[pt]',
  'pubt.meta-analysis': '"meta-analysis"[pt]',
  'pubt.randomizedcontrolledtrial': '"randomized controlled trial"[pt]',
  'pubt.review': 'review[pt]',
  'pubt.systematicreview': '"systematic review"[pt]',
};

function translateFilter(filter: string): string | undefined {
  const known = FILTERS[filter.toLowerCase()];
  if (known) return known;
  const years = /^years\.(\d{4})-(\d{4})$/.exec(filter);
  return years ? `${years[1]!}:${years[2]!}[dp]` : undefined;
}

/**
 * Recognizes a PubMed search URL (`pubmed.ncbi.nlm.nih.gov/?term=…[&filter=…]`).
 * Common filters (free full text, abstract, years, publication types) are
 * translated into query syntax; others are reported in `ignoredFilters`.
 */
export function parsePubmedSearchUrl(input: string): PubmedSearchRef | undefined {
  const url = parseUrl(input);
  if (!url || url.hostname.toLowerCase() !== 'pubmed.ncbi.nlm.nih.gov') return undefined;
  if (segments(url).length !== 0) return undefined;
  const term = url.searchParams.get('term')?.replace(/\s+/g, ' ').trim();
  if (!term) return undefined;
  const translated: string[] = [];
  const ignoredFilters: string[] = [];
  for (const filter of url.searchParams.getAll('filter')) {
    const clause = translateFilter(filter.trim());
    if (clause === undefined) ignoredFilters.push(filter.trim());
    else if (!translated.includes(clause)) translated.push(clause);
  }
  const query = translated.length === 0 ? term : [`(${term})`, ...translated].join(' AND ');
  return { query, ignoredFilters };
}

/** The search's stable identity key: the query with whitespace collapsed, lowercased. */
export function pubmedSearchKey(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether a URL is a PubMed article or search this adapter reads. */
export function isPubmedUrl(input: string): boolean {
  return parsePubmedArticleUrl(input) !== undefined || parsePubmedSearchUrl(input) !== undefined;
}

/**
 * The ids an input names: a PMID or PMCID from an article URL, or from a bare
 * `PMID: 123` / `PMC123` string. For a future DOI or bulk input.
 */
export function pubmedIds(input: string): PubmedArticleRef | undefined {
  const value = input.trim();
  const fromUrl = parsePubmedArticleUrl(value);
  if (fromUrl) return fromUrl;
  const pmc = pmcRef(value.replace(/^pmcid:\s*/i, ''));
  if (pmc) return pmc;
  return pmidRef(value.replace(/^pmid:\s*/i, ''));
}

/** The canonical PubMed page of an article. */
export function pubmedArticleUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

/** The canonical PMC page of an article. */
export function pmcArticleUrl(pmcid: string): string {
  return `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;
}

/** The canonical PubMed search page of a query. */
export function pubmedSearchUrl(query: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/?${new URLSearchParams({ term: query }).toString()}`;
}

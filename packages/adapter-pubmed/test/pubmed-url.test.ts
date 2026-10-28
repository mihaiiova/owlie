import { describe, expect, it } from 'vitest';
import {
  isPubmedUrl,
  parsePubmedArticleUrl,
  parsePubmedSearchUrl,
  pubmedIds,
  pubmedSearchKey,
  pubmedSearchUrl,
} from '@owlieio/adapter-pubmed';

describe('parsePubmedArticleUrl', () => {
  it.each([
    ['https://pubmed.ncbi.nlm.nih.gov/34265844/', { kind: 'pmid', pmid: '34265844' }],
    ['https://pubmed.ncbi.nlm.nih.gov/34265844', { kind: 'pmid', pmid: '34265844' }],
    ['http://www.ncbi.nlm.nih.gov/pubmed/34265844', { kind: 'pmid', pmid: '34265844' }],
    ['https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/', { kind: 'pmcid', pmcid: 'PMC8371605' }],
    [
      'https://www.ncbi.nlm.nih.gov/pmc/articles/pmc8371605',
      { kind: 'pmcid', pmcid: 'PMC8371605' },
    ],
    ['https://europepmc.org/article/MED/34265844', { kind: 'pmid', pmid: '34265844' }],
    ['https://europepmc.org/article/PMC/PMC8371605', { kind: 'pmcid', pmcid: 'PMC8371605' }],
  ])('recognizes %s', (url, ref) => {
    expect(parsePubmedArticleUrl(url)).toEqual(ref);
  });

  it.each([
    'https://pubmed.ncbi.nlm.nih.gov/',
    'https://pubmed.ncbi.nlm.nih.gov/?term=x',
    'https://pubmed.ncbi.nlm.nih.gov/abc/',
    'https://pubmed.ncbi.nlm.nih.gov/1234567890/',
    'https://pubmed.ncbi.nlm.nih.gov.evil.example/34265844/',
    'https://pmc.ncbi.nlm.nih.gov/articles/8371605/',
    'https://europepmc.org/article/PPR/PPR123',
    'https://user:pw@pubmed.ncbi.nlm.nih.gov/34265844/',
    'not a url',
  ])('does not recognize %s', (url) => {
    expect(parsePubmedArticleUrl(url)).toBeUndefined();
  });
});

describe('parsePubmedSearchUrl', () => {
  it('reads the term with whitespace collapsed', () => {
    expect(
      parsePubmedSearchUrl(
        'https://pubmed.ncbi.nlm.nih.gov/?term=%22GLP-1%22++AND+%22alcohol+use+disorder%22&sort=date',
      ),
    ).toEqual({ query: '"GLP-1" AND "alcohol use disorder"', ignoredFilters: [] });
  });

  it('translates common filters and reports the rest', () => {
    expect(
      parsePubmedSearchUrl(
        'https://pubmed.ncbi.nlm.nih.gov/?term=sepsis&filter=simsearch2.ffrft&filter=years.2020-2024&filter=pubt.review&filter=lang.english&filter=pubt.review',
      ),
    ).toEqual({
      query: '(sepsis) AND ffrft[Filter] AND 2020:2024[dp] AND review[pt]',
      ignoredFilters: ['lang.english'],
    });
  });

  it('needs a term on the search page', () => {
    expect(parsePubmedSearchUrl('https://pubmed.ncbi.nlm.nih.gov/?term=+')).toBeUndefined();
    expect(
      parsePubmedSearchUrl('https://pubmed.ncbi.nlm.nih.gov/34265844/?term=x'),
    ).toBeUndefined();
    expect(isPubmedUrl('https://pubmed.ncbi.nlm.nih.gov/?term=x')).toBe(true);
  });

  it('builds a stable key and canonical URL', () => {
    expect(pubmedSearchKey('  Sepsis   AND  Children ')).toBe('sepsis and children');
    expect(pubmedSearchUrl('a b')).toBe('https://pubmed.ncbi.nlm.nih.gov/?term=a+b');
  });
});

describe('pubmedIds', () => {
  it('reads URLs and bare ids', () => {
    expect(pubmedIds('PMID: 34265844')).toEqual({ kind: 'pmid', pmid: '34265844' });
    expect(pubmedIds('pmc8371605')).toEqual({ kind: 'pmcid', pmcid: 'PMC8371605' });
    expect(pubmedIds('https://pmc.ncbi.nlm.nih.gov/articles/PMC8371605/')).toEqual({
      kind: 'pmcid',
      pmcid: 'PMC8371605',
    });
    expect(pubmedIds('10.1038/x')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  abstractText,
  isRetracted,
  parseIdConversion,
  parseNcbiXml,
  parsePmcArticle,
  parsePubmedArticles,
  parsePubmedSearch,
  parsePubmedSummaries,
} from '@owlieio/adapter-pubmed';
import { ExtractionError } from '@owlieio/core';
import { pubmedFixtures } from '@owlieio/testing';

const {
  ALPHAFOLD_ARTICLE,
  EMPTY_SET,
  ESEARCH_ERROR,
  RETRACTED_ARTICLE,
  esearch,
  esummary,
  idconv,
  pmcArticle,
  pmcSet,
  pubmedSet,
  summaryRecord,
} = pubmedFixtures;

describe('parsePubmedArticles', () => {
  it('maps a PubMed record, with entities decoded and ids from the article only', () => {
    const [record] = parsePubmedArticles(pubmedSet(ALPHAFOLD_ARTICLE));
    expect(record).toEqual({
      pmid: '34265844',
      title: 'Highly accurate protein structure prediction with AlphaFold.',
      authors: ['John Jumper', 'Augustin Žídek', 'Demis Hassabis'],
      affiliations: ['DeepMind, London, UK.'],
      abstractSections: [
        {
          text: 'Proteins are essential to life, and understanding their structure can facilitate a mechanistic understanding of their function.',
        },
      ],
      journal: 'Nature',
      journalAbbreviation: 'Nature',
      volume: '596',
      issue: '7873',
      pages: '583-589',
      publicationDate: '2021-07-15',
      publicationTypes: ['Journal Article'],
      meshHeadings: ['Protein Folding', 'Deep Learning'],
      keywords: [],
      language: 'eng',
      doi: '10.1038/s41586-021-03819-2',
      pmcid: 'PMC8371605',
    });
  });

  it('keeps structured abstract labels, collective authors, and the retraction mark', () => {
    const [record] = parsePubmedArticles(pubmedSet(RETRACTED_ARTICLE));
    expect(record!.authors).toEqual(['A J Wakefield', 'Royal Free Study Group']);
    expect(record!.publicationDate).toBe('1998-02-28');
    expect(record!.keywords).toEqual(['autism']);
    expect(isRetracted(record!)).toBe(true);
    expect(abstractText(record!.abstractSections)).toBe(
      'BACKGROUND\n\nWe investigated a consecutive series of children.\n\nMETHODS\n\n12 children were referred to a paediatric unit.',
    );
    expect(record).not.toHaveProperty('pmcid');
  });

  it('returns nothing for an unknown PMID', () => {
    expect(parsePubmedArticles(EMPTY_SET)).toEqual([]);
  });

  it('refuses internal DTD subsets and entity declarations', () => {
    expect(() => parseNcbiXml('<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>', 'PubMed XML')).toThrow(
      'contains a DTD or entity declaration',
    );
    expect(() =>
      parseNcbiXml('<!DOCTYPE x SYSTEM "file:///etc/passwd"><x/>', 'PubMed XML'),
    ).toThrow(ExtractionError);
    expect(() => parsePubmedArticles('<x/>')).toThrow('no PubmedArticleSet');
  });
});

describe('parsePmcArticle', () => {
  it('turns the JATS body into paragraphs, without citations, graphics or references', () => {
    const article = parsePmcArticle(pmcSet(pmcArticle()))!;
    expect(article.front).toEqual({
      pmid: '34265844',
      pmcid: 'PMC8371605',
      doi: '10.1038/s41586-021-03819-2',
      title: 'Highly accurate protein structure prediction with AlphaFold',
      authors: ['John Jumper', 'Demis Hassabis'],
      abstract: 'Proteins are essential to life.',
      journal: 'Nature',
      publicationDate: '2021-07-15',
    });
    const paragraphs = article.body!.split('\n\n');
    expect(paragraphs[0]).toBe('Main');
    expect(paragraphs[1]).toMatch(/fallen short of atomic accuracy, see Fig\. 1\.$/);
    expect(paragraphs[2]).toBe(
      'Fig. 1 AlphaFold produces highly accurate structures. a, The performance of AlphaFold on CASP14 (n = 87).',
    );
    expect(paragraphs[3]).toBe('The AlphaFold network');
    expect(paragraphs[4]).toMatch(/The loss is \$\\mathcal\{L\}_\{FAPE\}\$ over all frames\.$/);
    expect(paragraphs.slice(5)).toEqual(['- Evoformer blocks', '- A structure module']);
    expect(article.body).not.toContain('Supplementary information');
    expect(article.body).not.toContain('A cited paper');
  });

  it('has no body when PMC withholds it', () => {
    expect(parsePmcArticle(pmcSet(pmcArticle({ body: false })))).toMatchObject({
      front: { pmcid: 'PMC8371605' },
    });
    expect(parsePmcArticle(pmcSet(pmcArticle({ body: false })))?.body).toBeUndefined();
  });
});

describe('E-utilities JSON', () => {
  it('reads a search and its NCBI messages', () => {
    expect(
      parsePubmedSearch(
        esearch(['2', '1'], 142, {
          warninglist: { outputmessages: ['Unmatched double quote ignored.'] },
        }),
      ),
    ).toEqual({ ids: ['2', '1'], count: 142, messages: ['Unmatched double quote ignored.'] });
    expect(() => parsePubmedSearch(ESEARCH_ERROR)).toThrow('PubMed search failed: Empty term');
    expect(() => parsePubmedSearch('{}')).toThrow('no esearchresult');
  });

  it('reads summaries in order and skips errors', () => {
    const summaries = parsePubmedSummaries(
      esummary(['42750843', '999999999'], { '42750843': summaryRecord('42750843') }),
      ['42750843', '999999999'],
    );
    expect(summaries).toEqual([
      {
        pmid: '42750843',
        title: 'Co-treating opioid and alcohol use disorders in the GLP-1 era.',
        authors: ['Qeadan F', 'Barbeau WA'],
        journal: 'Drug and alcohol dependence reports',
        publicationDate: '2026-09-02',
        publicationTypes: ['Journal Article', 'Review'],
        doi: '10.1016/j.dadr.2026.100474',
        pmcid: 'PMC13578398',
      },
    ]);
  });

  it('reads ID conversions', () => {
    expect(
      parseIdConversion(
        idconv('PMC8371605', { pmid: 34265844, doi: '10.1038/S41586' }),
        'PMC8371605',
      ),
    ).toEqual({
      pmid: '34265844',
      doi: '10.1038/s41586',
    });
    expect(parseIdConversion(idconv('PMC1', {}), 'PMC1')).toEqual({});
    expect(
      parseIdConversion(
        idconv('PMC9', { status: 'error', errmsg: 'Identifier not found in PMC' }),
        'PMC9',
      ),
    ).toBeUndefined();
  });
});

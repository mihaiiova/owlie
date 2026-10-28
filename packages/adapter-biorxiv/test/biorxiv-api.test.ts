import { describe, expect, it } from 'vitest';
import {
  decodeGreek,
  parseBiorxivDetails,
  parseBiorxivPublication,
  prepareBiorxivHtml,
} from '@owlieio/adapter-biorxiv';
import { ExtractionError } from '@owlieio/core';
import { biorxivFixtures } from '@owlieio/testing';

const {
  ABSTRACT_ONLY_HTML,
  DETAILS_MEDRXIV,
  DETAILS_PUBLISHED,
  DETAILS_TWO_VERSIONS,
  FULL_TEXT_HTML,
  NO_POSTS,
  PUBS_PUBLISHED,
  details,
  record,
} = biorxivFixtures;

describe('parseBiorxivDetails', () => {
  it('maps every version of a preprint', () => {
    const page = parseBiorxivDetails(DETAILS_TWO_VERSIONS, 'biorxiv');
    expect(page.status).toBe('ok');
    expect(page.records.map((entry) => [entry.version, entry.date])).toEqual([
      [1, '2026-08-31'],
      [2, '2026-10-26'],
    ]);
    expect(page.records[1]).toEqual({
      doi: '10.64898/2026.08.27.747565',
      title: 'The insect brain is specified by a conserved transcriptional program',
      authors: ['Cabanas, N.', 'Veloso, A.', 'Zinzen, R.', 'Bucher, G.'],
      correspondingAuthor: 'Gregor Bucher',
      correspondingInstitution: 'University of Göttingen',
      date: '2026-10-26',
      version: 2,
      type: 'new results',
      license: 'cc_no',
      category: 'neuroscience',
      server: 'biorxiv',
      abstract: 'The brain is the central processing center that integrates information.',
    });
  });

  it('reads the server from the record, and treats NA as missing', () => {
    const [entry] = parseBiorxivDetails(DETAILS_MEDRXIV, 'biorxiv').records;
    expect(entry).toMatchObject({ server: 'medrxiv', type: 'PUBLISHAHEADOFPRINT' });
    expect(entry).not.toHaveProperty('published');
  });

  it('decodes {beta}-style Greek letters and keeps the journal DOI', () => {
    const [entry] = parseBiorxivDetails(DETAILS_PUBLISHED, 'biorxiv').records;
    expect(entry!.title).toBe(
      'Dysregulation in mTOR/HIF-1 signaling and TGF-β in SARS-CoV-2 infected cells',
    );
    expect(entry!.abstract).toBe('How Δ infections engage cellular host pathways remains elusive.');
    expect(entry!.published).toBe('10.1080/22221751.2020.1799723');
    expect(decodeGreek('{unknown} and {Omega}')).toBe('{unknown} and Ω');
  });

  it('reads interval messages and empty pages', () => {
    const page = parseBiorxivDetails(
      details([record()], { status: 'ok', category: 'Neuroscience', total: '46' }),
      'biorxiv',
    );
    expect(page).toMatchObject({ category: 'neuroscience', total: 46 });
    expect(parseBiorxivDetails(NO_POSTS, 'biorxiv')).toEqual({
      status: 'no posts found',
      records: [],
    });
  });

  it('skips records without a DOI, title or version, and rejects bad JSON', () => {
    const page = parseBiorxivDetails(
      details([record({ doi: '' }), record({ version: 'x' }), record({ title: 'NA' }), record()]),
      'biorxiv',
    );
    expect(page.records).toHaveLength(1);
    expect(() => parseBiorxivDetails('<html>', 'biorxiv')).toThrow(ExtractionError);
    expect(() => parseBiorxivDetails('[]', 'biorxiv')).toThrow('unexpected response');
  });
});

describe('parseBiorxivPublication', () => {
  it('reads the journal and date', () => {
    expect(parseBiorxivPublication(PUBS_PUBLISHED)).toEqual({
      journal: 'Emerging Microbes & Infections',
      publishedDate: '2020-07-31',
    });
    expect(parseBiorxivPublication(NO_POSTS)).toBeUndefined();
  });
});

describe('prepareBiorxivHtml', () => {
  it('keeps only the body sections, nested content included', () => {
    const prepared = prepareBiorxivHtml(FULL_TEXT_HTML, 'A <title>')!;
    expect(prepared).toContain('<title>A &lt;title&gt;</title>');
    expect(prepared).toContain('INTRODUCTION');
    expect(prepared).toContain('Study design');
    expect(prepared).toContain('Figure 1.');
    expect(prepared).toContain('RESULTS');
    for (const dropped of [
      'ABSTRACT',
      'ACKNOWLEDGEMENTS',
      'Footnotes',
      'REFERENCES',
      'Subject Areas',
      'Safrit',
      'Copyright',
    ]) {
      expect(prepared).not.toContain(dropped);
    }
  });

  it('finds no body on a page that only has the abstract', () => {
    expect(prepareBiorxivHtml(ABSTRACT_ONLY_HTML, 'x')).toBeUndefined();
  });
});

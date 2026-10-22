import { describe, expect, it } from 'vitest';
import { ExtractionError } from '@owlieio/core';
import { parseArxivApiFeed, parseArxivRss } from '../src/arxiv-feed.js';
import { arxivFixtures } from '@owlieio/testing';

const { API_ATTENTION, API_EMPTY, API_OLD_STYLE, API_QUERY, RSS_CS_CL } = arxivFixtures;

describe('parseArxivApiFeed', () => {
  it('reads paper metadata from an API entry, collapsing whitespace and decoding entities', () => {
    const { papers, totalResults } = parseArxivApiFeed(API_ATTENTION);
    expect(totalResults).toBe(1);
    expect(papers).toEqual([
      {
        id: '1706.03762',
        version: 'v7',
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
        abstract:
          'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer & show it works.',
        published: '2017-06-12T17:57:34.000Z',
        updated: '2023-08-02T00:41:18.000Z',
        primaryCategory: 'cs.CL',
        categories: ['cs.CL', 'cs.LG'],
        comment: '15 pages, 5 figures',
      },
    ]);
  });

  it('reads old-style identifiers, DOI and journal reference', () => {
    expect(parseArxivApiFeed(API_OLD_STYLE).papers[0]).toMatchObject({
      id: 'hep-th/9901001',
      version: 'v3',
      authors: ['Yosuke Imamura'],
      doi: '10.1143/PTP.101.1155',
      journalRef: 'Prog.Theor.Phys.101:1155-1164,1999',
    });
  });

  it('returns no papers for an empty result and keeps result order for queries', () => {
    expect(parseArxivApiFeed(API_EMPTY)).toEqual({ papers: [], totalResults: 0 });
    expect(parseArxivApiFeed(API_QUERY).papers.map((paper) => paper.id)).toEqual([
      '2610.11111',
      '2610.22222',
    ]);
  });

  it('rejects DTDs and non-feed documents', () => {
    expect(() => parseArxivApiFeed('<!DOCTYPE x [<!ENTITY a "b">]><feed/>')).toThrow(
      ExtractionError,
    );
    expect(() => parseArxivApiFeed('<html></html>')).toThrow('not an arXiv API response');
  });
});

describe('parseArxivRss', () => {
  it('reads announcements with their type, identifiers, authors, license and DOI', () => {
    const { title, entries } = parseArxivRss(RSS_CS_CL);
    expect(title).toBe('cs.CL updates on arXiv.org');
    expect(entries.map((entry) => [entry.id, entry.version, entry.announceType])).toEqual([
      ['2610.28673', 'v1', 'new'],
      ['2610.26542', 'v1', 'cross'],
      ['2503.00128', 'v2', 'replace'],
      ['2008.11573', 'v2', 'replace-cross'],
      ['hep-th/9901001', 'v4', 'new'],
    ]);
    expect(entries[1]).toMatchObject({
      title: 'Breaking Diffusion',
      authors: ['Jaesang Yu', 'Seoyeon Byun', 'Juho Kim'],
      abstract: 'The abstract of Breaking Diffusion.',
      categories: ['cs.AI', 'cs.CL'],
      published: '2026-10-22T04:00:00.000Z',
      license: 'http://creativecommons.org/licenses/by/4.0/',
    });
    expect(entries[3]?.doi).toBe('10.1109/TNNLS.2021.3094304');
    expect(entries[4]?.title).toBe('Old Style & Fine');
  });

  it('rejects documents that are not RSS', () => {
    expect(() => parseArxivRss(API_ATTENTION)).toThrow('not an arXiv RSS feed');
  });
});

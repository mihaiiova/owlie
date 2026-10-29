import { describe, expect, it } from 'vitest';
import {
  biorxivCollectionUrl,
  biorxivContentUrl,
  biorxivDoi,
  findSubject,
  isBiorxivCollectionPath,
  isBiorxivUrl,
  listSubjects,
  parseBiorxivCollectionUrl,
  parseBiorxivPaperUrl,
} from '@owlieio/adapter-biorxiv';

describe('parseBiorxivPaperUrl', () => {
  it.each([
    [
      'https://www.biorxiv.org/content/10.64898/2026.10.16.759679v1',
      '10.64898/2026.10.16.759679',
      1,
    ],
    [
      'https://www.biorxiv.org/content/10.64898/2026.10.16.759679v2.full',
      '10.64898/2026.10.16.759679',
      2,
    ],
    [
      'https://biorxiv.org/content/10.1101/2020.12.08.416297v3.full.pdf',
      '10.1101/2020.12.08.416297',
      3,
    ],
    [
      'http://www.biorxiv.org/content/10.1101/2020.12.08.416297.abstract',
      '10.1101/2020.12.08.416297',
      undefined,
    ],
    [
      'https://www.biorxiv.org/content/10.1101/2020.12.08.416297v1.supplementary-material',
      '10.1101/2020.12.08.416297',
      1,
    ],
    [
      'https://www.biorxiv.org/content/10.1101/2020.12.08.416297/',
      '10.1101/2020.12.08.416297',
      undefined,
    ],
    [
      'https://www.biorxiv.org/cgi/content/short/2020.12.08.416297v1',
      '10.1101/2020.12.08.416297',
      1,
    ],
  ])('recognizes %s', (url, doi, version) => {
    expect(parseBiorxivPaperUrl(url)).toEqual({
      doi,
      server: 'biorxiv',
      ...(version === undefined ? {} : { version }),
    });
  });

  it('recognizes medRxiv preprints, with their eight-digit suffixes', () => {
    expect(
      parseBiorxivPaperUrl('https://www.medrxiv.org/content/10.64898/2026.10.22.26363582v1.full'),
    ).toEqual({ doi: '10.64898/2026.10.22.26363582', server: 'medrxiv', version: 1 });
    expect(
      parseBiorxivPaperUrl('https://medrxiv.org/content/10.1101/2020.04.13.20063966v2'),
    ).toEqual({ doi: '10.1101/2020.04.13.20063966', server: 'medrxiv', version: 2 });
  });

  it('lowercases the identity and leaves out the version', () => {
    expect(
      parseBiorxivPaperUrl('https://WWW.BIORXIV.ORG/content/10.64898/2026.10.16.759679v1')?.doi,
    ).toBe('10.64898/2026.10.16.759679');
  });

  it.each([
    // Cold Spring Harbor journal DOIs share the 10.1101 prefix but are not dated.
    'https://www.biorxiv.org/content/10.1101/gr.123456.111',
    'https://genome.cshlp.org/content/10.1101/2020.12.08.416297',
    'https://www.biorxiv.org.evil.example/content/10.1101/2020.12.08.416297',
    'https://evilbiorxiv.org/content/10.1101/2020.12.08.416297',
    'https://www.biorxiv.org/content/10.1234/2020.12.08.416297',
    'https://www.biorxiv.org/content/10.1101/2020.12.08.4162',
    'https://www.biorxiv.org/collection/neuroscience',
    'https://user:pass@www.biorxiv.org/content/10.1101/2020.12.08.416297',
    'ftp://www.biorxiv.org/content/10.1101/2020.12.08.416297',
    'not a url',
  ])('does not recognize %s', (url) => {
    expect(parseBiorxivPaperUrl(url)).toBeUndefined();
  });
});

describe('biorxivDoi', () => {
  it.each([
    ['10.64898/2026.10.16.759679', '10.64898/2026.10.16.759679'],
    ['doi:10.1101/2020.12.08.416297', '10.1101/2020.12.08.416297'],
    ['https://doi.org/10.1101/2020.12.08.416297', '10.1101/2020.12.08.416297'],
    ['https://dx.doi.org/10.1101%2F2020.12.08.416297', '10.1101/2020.12.08.416297'],
    [
      'https://www.medrxiv.org/content/10.64898/2026.10.22.26363582v1',
      '10.64898/2026.10.22.26363582',
    ],
  ])('reads %s', (input, doi) => {
    expect(biorxivDoi(input)).toBe(doi);
  });

  it.each(['10.1101/gr.123456.111', '10.1038/s41586-021-03819-2', 'https://doi.org/10.1038/x', ''])(
    'rejects %s',
    (input) => {
      expect(biorxivDoi(input)).toBeUndefined();
    },
  );
});

describe('parseBiorxivCollectionUrl', () => {
  it('recognizes subjects on both servers by their site slug', () => {
    expect(parseBiorxivCollectionUrl('https://www.biorxiv.org/collection/neuroscience')).toEqual({
      kind: 'subject',
      subject: {
        server: 'biorxiv',
        slug: 'neuroscience',
        title: 'Neuroscience',
        apiName: 'neuroscience',
      },
    });
    expect(
      parseBiorxivCollectionUrl('https://medrxiv.org/collection/infectious-diseases/'),
    ).toMatchObject({
      kind: 'subject',
      subject: { slug: 'infectious_diseases', apiName: 'infectious_diseases' },
    });
    expect(
      parseBiorxivCollectionUrl(
        'https://www.medrxiv.org/collection/endocrinology-including-diabetes-mellitus-and-metabolic-disease',
      ),
    ).toMatchObject({ subject: { apiName: 'endocrinology' } });
  });

  it('recognizes a whole server', () => {
    expect(parseBiorxivCollectionUrl('https://www.medrxiv.org/collection')).toEqual({
      kind: 'server',
      server: 'medrxiv',
    });
    expect(parseBiorxivCollectionUrl('https://www.biorxiv.org/collection/all')).toEqual({
      kind: 'server',
      server: 'biorxiv',
    });
  });

  it('does not recognize unknown or moved subjects, but still sees a collection path', () => {
    // bioRxiv's Epidemiology moved to medRxiv; the API no longer has it.
    for (const url of [
      'https://www.biorxiv.org/collection/epidemiology',
      'https://www.biorxiv.org/collection/astrology',
    ]) {
      expect(parseBiorxivCollectionUrl(url)).toBeUndefined();
      expect(isBiorxivCollectionPath(url)).toBe(true);
    }
    expect(
      parseBiorxivCollectionUrl('https://www.medrxiv.org/collection/epidemiology'),
    ).toBeDefined();
    expect(isBiorxivCollectionPath('https://example.com/collection/neuroscience')).toBe(false);
  });

  it('builds canonical URLs', () => {
    expect(biorxivContentUrl('medrxiv', '10.64898/2026.10.22.26363582', 2)).toBe(
      'https://www.medrxiv.org/content/10.64898/2026.10.22.26363582v2',
    );
    expect(
      biorxivCollectionUrl({ kind: 'subject', subject: findSubject('biorxiv', 'cell_biology')! }),
    ).toBe('https://www.biorxiv.org/collection/cell-biology');
    expect(isBiorxivUrl('https://www.biorxiv.org/collection')).toBe(true);
  });

  it('maps every subject to an API name', () => {
    expect(listSubjects('biorxiv')).toHaveLength(25);
    expect(listSubjects('medrxiv')).toHaveLength(51);
    for (const subject of [...listSubjects('biorxiv'), ...listSubjects('medrxiv')]) {
      expect(subject.apiName).toMatch(/^[a-z_]+$/);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  arxivAbsUrl,
  isArxivUrl,
  parseArxivCollectionUrl,
  parseArxivPaperUrl,
} from '../src/arxiv-url.js';

describe('parseArxivPaperUrl', () => {
  it.each([
    ['https://arxiv.org/abs/2401.12345', '2401.12345', undefined],
    ['https://arxiv.org/abs/2401.12345v2', '2401.12345', 'v2'],
    ['http://www.arxiv.org/abs/0704.0001', '0704.0001', undefined],
    ['https://arxiv.org/pdf/2401.12345', '2401.12345', undefined],
    ['https://arxiv.org/pdf/2401.12345v3.pdf', '2401.12345', 'v3'],
    ['https://arxiv.org/pdf/2401.12345.pdf', '2401.12345', undefined],
    ['https://arxiv.org/html/2401.12345v1', '2401.12345', 'v1'],
    ['https://arxiv.org/html/2401.12345v1/', '2401.12345', 'v1'],
    ['https://arxiv.org/html/2401.12345v1/index.html#S2', '2401.12345', 'v1'],
    ['https://export.arxiv.org/abs/1706.03762', '1706.03762', undefined],
    ['https://arxiv.org/abs/hep-th/9901001', 'hep-th/9901001', undefined],
    ['https://arxiv.org/abs/hep-th/9901001v3', 'hep-th/9901001', 'v3'],
    ['https://arxiv.org/pdf/math.GT/0309136v1', 'math.GT/0309136', 'v1'],
    ['https://arxiv.org/abs/cond-mat/0102536?context=cond-mat', 'cond-mat/0102536', undefined],
  ])('recognizes %s', (url, id, version) => {
    expect(parseArxivPaperUrl(url)).toEqual(version ? { id, version } : { id });
  });

  it.each([
    'https://arxiv.org/',
    'https://arxiv.org/abs/',
    'https://arxiv.org/abs/2401.123',
    'https://arxiv.org/abs/24011.2345',
    'https://arxiv.org/list/cs.CL/new',
    'https://notarxiv.org/abs/2401.12345',
    'https://arxiv.org.evil.example/abs/2401.12345',
    'https://user:pw@arxiv.org/abs/2401.12345',
    'ftp://arxiv.org/abs/2401.12345',
    'not a url',
  ])('rejects %s', (url) => {
    expect(parseArxivPaperUrl(url)).toBeUndefined();
  });
});

describe('parseArxivCollectionUrl', () => {
  it.each([
    ['https://rss.arxiv.org/rss/cs.CL', ['cs.CL']],
    ['https://rss.arxiv.org/atom/cs.CL+cs.LG', ['cs.CL', 'cs.LG']],
    ['http://export.arxiv.org/rss/astro-ph', ['astro-ph']],
    ['https://arxiv.org/list/cs.CL/new', ['cs.CL']],
    ['https://arxiv.org/list/math.GT/recent', ['math.GT']],
    ['https://arxiv.org/list/hep-th', ['hep-th']],
  ])('recognizes the category feed %s', (url, categories) => {
    expect(parseArxivCollectionUrl(url)).toEqual({ kind: 'category', categories });
  });

  it('recognizes an API search query and normalizes its whitespace', () => {
    expect(
      parseArxivCollectionUrl(
        'https://export.arxiv.org/api/query?search_query=cat:cs.CL%20AND%20%20abs:%22retrieval%22&max_results=5',
      ),
    ).toEqual({ kind: 'query', query: 'cat:cs.CL AND abs:"retrieval"' });
    expect(parseArxivCollectionUrl('http://arxiv.org/api/query?search_query=au:hinton')).toEqual({
      kind: 'query',
      query: 'au:hinton',
    });
  });

  it.each([
    'https://rss.arxiv.org/rss/',
    'https://rss.arxiv.org/rss/cs.CL/extra',
    'https://rss.arxiv.org/rss/<script>',
    'https://export.arxiv.org/api/query?id_list=1706.03762',
    'https://export.arxiv.org/api/query?search_query=',
    'https://arxiv.org/abs/2401.12345',
    'https://example.com/rss/cs.CL',
  ])('rejects %s', (url) => {
    expect(parseArxivCollectionUrl(url)).toBeUndefined();
  });
});

describe('isArxivUrl and arxivAbsUrl', () => {
  it('claims paper and collection URLs only', () => {
    expect(isArxivUrl('https://arxiv.org/abs/2401.12345')).toBe(true);
    expect(isArxivUrl('https://rss.arxiv.org/rss/cs.CL')).toBe(true);
    expect(isArxivUrl('https://arxiv.org/help/api')).toBe(false);
  });

  it('builds the canonical abstract page URL', () => {
    expect(arxivAbsUrl('2401.12345')).toBe('https://arxiv.org/abs/2401.12345');
    expect(arxivAbsUrl('hep-th/9901001')).toBe('https://arxiv.org/abs/hep-th/9901001');
  });
});

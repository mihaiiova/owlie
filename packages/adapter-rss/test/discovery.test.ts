import { describe, expect, it } from 'vitest';
import {
  capFeedCandidates,
  canonicalizeFeedCandidate,
  dedupeFeedCandidates,
  extractFeedLinks,
  isEligibleFeedLink,
  MAX_DISCOVERY_CANDIDATES,
  PROBE_PATHS,
  rankFeedCandidates,
  resolveFeedLinkHref,
} from '@owlieio/adapter-rss';
import type { FeedCandidate } from '@owlieio/adapter-rss';

describe('isEligibleFeedLink', () => {
  it('accepts an alternate RSS link and reports rss', () => {
    expect(isEligibleFeedLink('alternate', 'application/rss+xml')).toBe('rss');
  });

  it('accepts an alternate Atom link and reports atom', () => {
    expect(isEligibleFeedLink('alternate', 'application/atom+xml')).toBe('atom');
  });

  it('accepts a rel that contains the alternate token alongside other tokens', () => {
    expect(isEligibleFeedLink('alternate stylesheet', 'application/rss+xml')).toBe('rss');
  });

  it('matches rel and type tokens case-insensitively', () => {
    expect(isEligibleFeedLink('ALTERNATE', 'Application/Atom+XML')).toBe('atom');
  });

  it('accepts a parameterized feed content type', () => {
    expect(isEligibleFeedLink('alternate', 'application/rss+xml; charset=utf-8')).toBe('rss');
  });

  it('rejects a link without the alternate token', () => {
    expect(isEligibleFeedLink('stylesheet', 'application/rss+xml')).toBeNull();
  });

  it('rejects a missing rel', () => {
    expect(isEligibleFeedLink(undefined, 'application/rss+xml')).toBeNull();
  });

  it('rejects a JSON Feed type', () => {
    expect(isEligibleFeedLink('alternate', 'application/feed+json')).toBeNull();
  });

  it('rejects generic XML (not an RSS/Atom XML type)', () => {
    expect(isEligibleFeedLink('alternate', 'application/xml')).toBeNull();
    expect(isEligibleFeedLink('alternate', 'text/xml')).toBeNull();
  });

  it('rejects a missing type', () => {
    expect(isEligibleFeedLink('alternate', undefined)).toBeNull();
  });
});

describe('extractFeedLinks', () => {
  it('extracts an eligible link in document order', () => {
    const html =
      '<html><head>' +
      '<link rel="alternate" type="application/rss+xml" href="/feed.xml">' +
      '<link rel="alternate" type="application/atom+xml" href="/atom.xml">' +
      '</head></html>';
    expect(extractFeedLinks(html)).toEqual([
      { href: '/feed.xml', format: 'rss' },
      { href: '/atom.xml', format: 'atom' },
    ]);
  });

  it('skips links that are not alternate feeds', () => {
    const html =
      '<link rel="stylesheet" href="/style.css">' +
      '<link rel="alternate" type="application/feed+json" href="/feed.json">' +
      '<link rel="alternate" type="application/rss+xml" href="/feed.xml">';
    expect(extractFeedLinks(html)).toEqual([{ href: '/feed.xml', format: 'rss' }]);
  });

  it('reads attributes in any order with single or double quotes', () => {
    const html =
      '<link type="application/atom+xml" href="/atom.xml" rel="alternate">' +
      "<link href='/rss.xml' rel='alternate' type='application/rss+xml'>";
    expect(extractFeedLinks(html)).toEqual([
      { href: '/atom.xml', format: 'atom' },
      { href: '/rss.xml', format: 'rss' },
    ]);
  });
});

describe('resolveFeedLinkHref', () => {
  it('resolves an absolute-path href against the final page URL', () => {
    expect(resolveFeedLinkHref('/feed.xml', 'https://example.com/blog/')).toBe(
      'https://example.com/feed.xml',
    );
  });

  it('resolves a relative href against the final page URL', () => {
    expect(resolveFeedLinkHref('feed.xml', 'https://example.com/blog/')).toBe(
      'https://example.com/blog/feed.xml',
    );
  });

  it('passes through an absolute http(s) href', () => {
    expect(resolveFeedLinkHref('https://example.com/feed.xml', 'https://example.com/')).toBe(
      'https://example.com/feed.xml',
    );
  });

  it('resolves a protocol-relative href', () => {
    expect(resolveFeedLinkHref('//cdn.example.com/feed.xml', 'https://example.com/')).toBe(
      'https://cdn.example.com/feed.xml',
    );
  });

  it('rejects a missing href', () => {
    expect(resolveFeedLinkHref(undefined, 'https://example.com/')).toBeUndefined();
  });

  it('rejects non-http(s) and malformed hrefs', () => {
    expect(resolveFeedLinkHref('javascript:alert(1)', 'https://example.com/')).toBeUndefined();
    expect(
      resolveFeedLinkHref('ftp://example.com/feed.xml', 'https://example.com/'),
    ).toBeUndefined();
    expect(resolveFeedLinkHref('data:text/html,x', 'https://example.com/')).toBeUndefined();
  });
});

describe('canonicalizeFeedCandidate', () => {
  it('drops the URL fragment', () => {
    expect(canonicalizeFeedCandidate('https://example.com/feed.xml#section')).toBe(
      'https://example.com/feed.xml',
    );
  });
});

describe('dedupeFeedCandidates', () => {
  it('keeps the first candidate for each canonical URL', () => {
    const candidates: FeedCandidate[] = [
      { url: 'https://example.com/feed.xml#a', format: 'rss' },
      { url: 'https://example.com/feed.xml#b', format: 'atom' },
      { url: 'https://example.com/atom.xml', format: 'atom' },
    ];
    expect(dedupeFeedCandidates(candidates)).toEqual([
      { url: 'https://example.com/feed.xml', format: 'rss' },
      { url: 'https://example.com/atom.xml', format: 'atom' },
    ]);
  });
});

describe('capFeedCandidates', () => {
  it('caps candidates at the configured maximum', () => {
    const candidates: FeedCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${i}.xml`,
      format: 'rss' as const,
    }));
    expect(capFeedCandidates(candidates)).toHaveLength(MAX_DISCOVERY_CANDIDATES);
    expect(capFeedCandidates(candidates).map((c) => c.url)).toEqual(
      Array.from({ length: MAX_DISCOVERY_CANDIDATES }, (_, i) => `https://example.com/${i}.xml`),
    );
  });
});

describe('rankFeedCandidates', () => {
  it('ranks RSS candidates before Atom candidates, preserving order within a format', () => {
    const candidates: FeedCandidate[] = [
      { url: 'https://example.com/atom-1', format: 'atom' },
      { url: 'https://example.com/rss-1', format: 'rss' },
      { url: 'https://example.com/atom-2', format: 'atom' },
      { url: 'https://example.com/rss-2', format: 'rss' },
    ];
    expect(rankFeedCandidates(candidates).map((c) => c.url)).toEqual([
      'https://example.com/rss-1',
      'https://example.com/rss-2',
      'https://example.com/atom-1',
      'https://example.com/atom-2',
    ]);
  });
});

describe('candidate selection', () => {
  it('ranks before capping so an RSS candidate beyond the first eight still wins', () => {
    const atoms: FeedCandidate[] = Array.from({ length: MAX_DISCOVERY_CANDIDATES }, (_, i) => ({
      url: `https://example.com/atom-${i}.xml`,
      format: 'atom' as const,
    }));
    const rss: FeedCandidate = { url: 'https://example.com/rss.xml', format: 'rss' };
    expect(
      capFeedCandidates(rankFeedCandidates([...atoms, rss])).map((candidate) => candidate.url),
    ).toEqual([
      rss.url,
      ...atoms.slice(0, MAX_DISCOVERY_CANDIDATES - 1).map((candidate) => candidate.url),
    ]);
  });
});

describe('PROBE_PATHS', () => {
  it('uses the agreed fixed conventional-path order', () => {
    expect(PROBE_PATHS).toEqual([
      '/feed',
      '/rss',
      '/feed.xml',
      '/rss.xml',
      '/atom.xml',
      '/index.xml',
    ]);
  });
});

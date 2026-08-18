import { describe, expect, it } from 'vitest';
import { detectFeedFormat, isFeedUrl, normalizeFeedUrl, RssAdapter } from '@owlieio/adapter-rss';

describe('detectFeedFormat (content-aware)', () => {
  it('detects Atom by root element', () => {
    expect(
      detectFeedFormat('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'),
    ).toBe('atom');
  });

  it('detects RSS 2.0 by root element', () => {
    expect(
      detectFeedFormat('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'),
    ).toBe('rss');
  });

  it('detects RSS 1.0 (RDF) by root element', () => {
    expect(
      detectFeedFormat('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'),
    ).toBe('rss');
  });

  it('does not rely on file extension', () => {
    // Reddit's `.rss` endpoints return Atom XML.
    expect(detectFeedFormat('<feed xmlns="http://www.w3.org/2005/Atom"><entry/></feed>')).toBe(
      'atom',
    );
  });

  it('returns null for non-feed documents', () => {
    expect(detectFeedFormat('<html><body>hi</body></html>')).toBeNull();
    expect(detectFeedFormat('just some text')).toBeNull();
  });
});

describe('feed URL helpers', () => {
  it('normalizes feed URLs by removing fragments', () => {
    expect(normalizeFeedUrl('https://example.com/feed.xml#fragment')).toBe(
      'https://example.com/feed.xml',
    );
  });

  it('recognizes feed URLs by suffix', () => {
    expect(isFeedUrl('https://example.com/feed.xml')).toBe(true);
    expect(isFeedUrl('https://example.com/feed')).toBe(true);
    expect(isFeedUrl('https://example.com/page')).toBe(false);
  });
});

describe('RssAdapter', () => {
  it('recognizes feed locators', () => {
    const adapter = new RssAdapter();
    expect(adapter.recognize({ url: 'https://example.com/feed.xml' })).toBe(true);
    expect(adapter.recognize({ url: 'https://example.com/page', hint: 'rss' })).toBe(true);
    expect(adapter.recognize({ url: 'https://example.com/page' })).toBe(false);
  });

  it('resolves a canonical collection with a stable identity', async () => {
    const adapter = new RssAdapter();
    const collection = await adapter.resolve({ url: 'https://example.com/feed.xml#top' });
    expect(collection.canonicalUrl).toBe('https://example.com/feed.xml');
    expect(collection.id).toBe('rss:feed:https://example.com/feed.xml');
  });
});

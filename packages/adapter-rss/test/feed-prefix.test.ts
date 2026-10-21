import { describe, expect, it } from 'vitest';
import { FeedDiscoveryService, parseFeed } from '@owlieio/adapter-rss';
import { FeedEntryScanner, feedHeaderText, stopAtFeedHeader } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';
import { RSS20 } from './fixtures.js';

function rss(items: string[], head = '<title>Show</title>'): string {
  return `<?xml version="1.0"?>\n<rss version="2.0"><channel>${head}${items.join('')}</channel></rss>`;
}

function item(n: number, extra = ''): string {
  return `<item><title>Episode ${n}</title><guid>ep-${n}</guid>${extra}</item>`;
}

/** Feeds `text` to a scanner in chunks of `size` characters, as a stream would. */
function scanInChunks(scanner: FeedEntryScanner, text: string, size: number): boolean {
  for (let end = size; end < text.length + size; end += size) {
    if (scanner.scan(text.slice(0, Math.min(end, text.length)))) return true;
  }
  return false;
}

describe('FeedEntryScanner', () => {
  it('cuts an RSS 2.0 feed before the entry after the limit and closes open elements', async () => {
    const text = rss([item(1), item(2), item(3)]);
    const scanner = new FeedEntryScanner(2);
    expect(scanner.scan(text)).toBe(true);
    const prefix = scanner.prefix(text);
    expect(prefix).toBe(rss([item(1), item(2)]));
    const feed = await parseFeed(prefix!);
    expect(feed.title).toBe('Show');
    expect(feed.entries.map((entry) => entry.id)).toEqual(['ep-1', 'ep-2']);
  });

  it('does not cut when the feed has no more entries than the limit', () => {
    const text = rss([item(1), item(2)]);
    const scanner = new FeedEntryScanner(2);
    expect(scanner.scan(text)).toBe(false);
    expect(scanner.prefix(text)).toBeUndefined();
  });

  it('gives the same cut whatever the chunk boundaries', () => {
    const text = rss([
      item(1, '<description><![CDATA[a <item> in </item> text]]></description>'),
      item(2, '<!-- an <item> in a comment -->'),
      item(3, '<enclosure url="https://cdn.example.com/a.mp3?x=1>2" type="audio/mpeg"/>'),
      item(4),
    ]);
    const whole = new FeedEntryScanner(3);
    whole.scan(text);
    const expected = whole.prefix(text);
    expect(expected).toBeDefined();
    for (const size of [1, 2, 3, 7, 16, 64]) {
      const scanner = new FeedEntryScanner(3);
      expect(scanInChunks(scanner, text, size), `chunk ${size}`).toBe(true);
      expect(scanner.prefix(text), `chunk ${size}`).toBe(expected);
    }
  });

  it('ignores item-like text in CDATA, comments and quoted attributes', async () => {
    const text = rss([
      item(1, '<description><![CDATA[<item>not an entry</item>]]></description>'),
      item(2, '<!-- <item> -->'),
      item(3, '<link title="a > b"/>'),
    ]);
    const scanner = new FeedEntryScanner(2);
    scanner.scan(text);
    const feed = await parseFeed(scanner.prefix(text)!);
    expect(feed.entries.map((entry) => entry.id)).toEqual(['ep-1', 'ep-2']);
  });

  it('counts only top-level entries, not item-named elements inside an entry', () => {
    const text = rss([item(1, '<podcast:item>x</podcast:item>'), item(2)]);
    const scanner = new FeedEntryScanner(1);
    scanner.scan(text);
    expect(scanner.prefix(text)).toBe(rss([item(1, '<podcast:item>x</podcast:item>')]));
  });

  it('cuts Atom and RSS 1.0 feeds', async () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
  <entry><title>One</title><id>tag:a,1</id><updated>2025-08-19T10:00:00Z</updated></entry>
  <entry><title>Two</title><id>tag:a,2</id><updated>2025-08-18T10:00:00Z</updated></entry>
</feed>`;
    const rss10 = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="https://example.com/"><title>RDF</title>
    <items><rdf:Seq><rdf:li rdf:resource="https://example.com/1"/></rdf:Seq></items></channel>
  <item rdf:about="https://example.com/1"><title>One</title><link>https://example.com/1</link></item>
  <item rdf:about="https://example.com/2"><title>Two</title><link>https://example.com/2</link></item>
</rdf:RDF>`;
    for (const fixture of [atom, rss10]) {
      const full = await parseFeed(fixture);
      expect(full.entries.length).toBeGreaterThan(1);
      const scanner = new FeedEntryScanner(1);
      expect(scanner.scan(fixture)).toBe(true);
      const cut = await parseFeed(scanner.prefix(fixture)!);
      expect(cut.title).toBe(full.title);
      expect(cut.entries).toEqual(full.entries.slice(0, 1));
    }
  });

  it('matches a full parse for the RSS 2.0 fixture', async () => {
    const full = await parseFeed(RSS20);
    const scanner = new FeedEntryScanner(1);
    scanner.scan(RSS20);
    const cut = await parseFeed(scanner.prefix(RSS20)!);
    expect(cut.entries).toEqual(full.entries.slice(0, 1));
    expect(cut.metadata).toEqual(full.metadata);
  });
});

describe('stopAtFeedHeader / feedHeaderText', () => {
  const feed = rss([item(1), item(2)]);

  it('stops a feed body at its first entry and leaves HTML and XHTML alone', () => {
    const stop = stopAtFeedHeader();
    expect(stop(feed.slice(0, 20), 'application/rss+xml')).toBe(false);
    expect(stop(feed, 'application/rss+xml')).toBe(true);
    expect(stopAtFeedHeader()(feed, 'text/html')).toBe(false);
    expect(stopAtFeedHeader()(feed, 'application/xhtml+xml')).toBe(false);
    expect(stopAtFeedHeader()(feed, null)).toBe(false);
  });

  it('turns a partial body into a parseable header and returns a full body unchanged', async () => {
    const header = feedHeaderText({ text: feed, partial: true });
    expect(header).toBe(rss([]));
    expect((await parseFeed(header!)).title).toBe('Show');
    expect(feedHeaderText({ text: feed })).toBe(feed);
    expect(feedHeaderText({ text: '<rss><channel><title>x', partial: true })).toBeUndefined();
  });
});

describe('FeedDiscoveryService on a large feed URL', () => {
  it('recognizes the feed from its header without reading the whole body', async () => {
    const big = rss(Array.from({ length: 2000 }, (_, i) => item(i + 1)));
    let delivered = 0;
    const fetcher: HttpFetcher = {
      async fetch(url, options) {
        delivered = big.length;
        for (let end = 64; options?.stopReading && end < big.length; end += 64) {
          if (options.stopReading(big.slice(0, end), 'application/xml')) {
            delivered = end;
            return { url, contentType: 'application/xml', text: big.slice(0, end), partial: true };
          }
        }
        return { url, contentType: 'application/xml', text: big };
      },
    };
    const found = await new FeedDiscoveryService({ fetcher }).discover({
      url: 'https://feeds.example.com/show',
    });
    expect(found.map((collection) => collection.canonicalUrl)).toEqual([
      'https://feeds.example.com/show',
    ]);
    expect(delivered).toBeLessThan(1000);
  });
});

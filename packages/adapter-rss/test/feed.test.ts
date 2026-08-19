import { describe, expect, it } from 'vitest';
import {
  decodeXmlEntities,
  detectFeedFormat,
  htmlToText,
  isFeedUrl,
  normalizeFeedUrl,
  parseFeed,
  RssAdapter,
} from '@owlieio/adapter-rss';
import { ExtractionError } from '@owlieio/core';
import { ATOM, BILLION_LAUGHS, REDDIT_ATOM, RSS10, RSS20 } from './fixtures.js';

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

describe('decodeXmlEntities', () => {
  it('decodes the predefined XML entities', () => {
    expect(decodeXmlEntities('a &amp; b &lt; c &gt; d &quot; e &apos; f')).toBe(
      'a & b < c > d " e \' f',
    );
  });

  it('decodes numeric character references (decimal and hex)', () => {
    expect(decodeXmlEntities('&#65;&#x42;')).toBe('AB');
  });

  it('decodes common HTML named entities', () => {
    expect(decodeXmlEntities('a&nbsp;b &mdash; c')).toBe('a\u00a0b \u2014 c');
  });

  it('leaves unknown entities untouched (no DTD expansion)', () => {
    expect(decodeXmlEntities('x &lol2; y')).toBe('x &lol2; y');
  });
});

describe('htmlToText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('removes scripts and styles', () => {
    expect(htmlToText('<p>a</p><script>alert(1)</script><style>p{}</style><p>b</p>')).toBe('a b');
  });

  it('decodes escaped markup before stripping it', () => {
    expect(htmlToText('&lt;p&gt;Body &amp; text&lt;/p&gt;')).toBe('Body & text');
  });
});

describe('parseFeed (RSS 2.0)', () => {
  it('normalizes channel and entry fields', async () => {
    const feed = await parseFeed(RSS20);

    expect(feed.format).toBe('rss');
    expect(feed.title).toBe('Example Channel');
    expect(feed.canonicalUrl).toBe('https://example.com/');
    expect(feed.metadata.imageUrl).toBe('https://example.com/logo.png');

    expect(feed.entries).toHaveLength(2);

    const first = feed.entries[0]!;
    expect(first.id).toBe('post-1');
    expect(first.title).toBe('First post');
    expect(first.url).toBe('https://example.com/1');
    expect(first.description).toBe('Summary & teaser');
    expect(first.content).toBe('<p>Full body with <b>markup</b>.</p>');
    expect(first.publishedAt).toBe('2025-08-19T10:00:00.000Z');
    expect(first.author).toBe('alice');
    expect(first.metadata.enclosureUrl).toBe('https://example.com/audio.mp3');
    expect(first.metadata.duration).toBe('45:00');
    expect(first.metadata.categories).toEqual(['tech']);
  });

  it('falls back to the link as the entry id when there is no guid', async () => {
    const feed = await parseFeed(RSS20);
    expect(feed.entries[1]!.id).toBe('https://example.com/2');
    expect(feed.entries[1]!.title).toBe('Second post');
  });
});

describe('parseFeed (Atom)', () => {
  it('normalizes feed and entry fields', async () => {
    const feed = await parseFeed(ATOM);

    expect(feed.format).toBe('atom');
    expect(feed.title).toBe('Example Feed');
    expect(feed.canonicalUrl).toBe('https://example.com/feed');
    expect(feed.metadata.subtitle).toBe('Subtitle text');

    const entry = feed.entries[0]!;
    expect(entry.id).toBe('tag:example.com,2025:1');
    expect(entry.title).toBe('Atom entry one');
    expect(entry.url).toBe('https://example.com/entries/1');
    expect(entry.description).toBe('A summary');
    expect(entry.content).toBe('<p>Body & text</p>');
    expect(entry.publishedAt).toBe('2025-08-19T10:00:00.000Z');
    expect(entry.author).toBe('Bob');
  });

  it('parses Reddit Atom-in-.rss content', async () => {
    const feed = await parseFeed(REDDIT_ATOM);

    expect(feed.format).toBe('atom');
    expect(feed.title).toBe('r/LocalLLaMA');

    const entry = feed.entries[0]!;
    expect(entry.id).toBe('t3_1abc123');
    expect(entry.title).toBe('A reddit post title');
    expect(entry.author).toBe('/u/someuser');
    expect(entry.content).toBe('<div class="md">Post body</div>');
    expect(entry.url).toBe('https://www.reddit.com/r/LocalLLaMA/comments/1abc123/title/');
  });
});

describe('parseFeed (RSS 1.0 RDF)', () => {
  it('parses items that are siblings of the channel', async () => {
    const feed = await parseFeed(RSS10);

    expect(feed.format).toBe('rss');
    expect(feed.title).toBe('RDF Channel');

    const entry = feed.entries[0]!;
    expect(entry.id).toBe('https://example.com/1');
    expect(entry.title).toBe('RDF item');
    expect(entry.description).toBe('RDF body');
    expect(entry.author).toBe('carol');
    expect(entry.publishedAt).toBe('2025-08-19T10:00:00.000Z');
  });
});

describe('parseFeed (safety)', () => {
  it('rejects a billion-laughs payload without expanding entities', async () => {
    await expect(parseFeed(BILLION_LAUGHS)).rejects.toThrow(ExtractionError);
    await expect(parseFeed(BILLION_LAUGHS)).rejects.toThrow(/DOCTYPE|entity/i);
  });

  it('rejects malformed XML', async () => {
    await expect(parseFeed('<rss attr="x>')).rejects.toThrow(ExtractionError);
    await expect(parseFeed('<rss><channel></rss')).rejects.toThrow(ExtractionError);
  });

  it('rejects non-feed documents', async () => {
    await expect(parseFeed('<html><body>hi</body></html>')).rejects.toThrow(ExtractionError);
  });

  it('returns an empty entry list for a feed with no items', async () => {
    const feed = await parseFeed('<rss version="2.0"><channel><title>t</title></channel></rss>');
    expect(feed.entries).toEqual([]);
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

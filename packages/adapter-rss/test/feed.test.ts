import { describe, expect, it } from 'vitest';
import {
  decodeXmlEntities,
  detectFeedFormat,
  entryToItem,
  htmlToText,
  isFeedUrl,
  normalizeFeedUrl,
  parseFeed,
  RssAdapter,
} from '@owlieio/adapter-rss';
import { ConfigurationError, ExtractionError } from '@owlieio/core';
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

  it('derives a stable hash id when an entry has neither guid nor link', async () => {
    const feed = await parseFeed(
      '<rss version="2.0"><channel><title>t</title><item><title>X</title><description>d</description></item></channel></rss>',
    );
    expect(feed.entries[0]!.id).toMatch(/^entry-[0-9a-f]+$/);
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

  it('rejects a malformed URL even with an rss hint', async () => {
    const adapter = new RssAdapter();
    await expect(adapter.resolve({ url: 'not a url', hint: 'rss' })).rejects.toThrow(
      ConfigurationError,
    );
  });
});

describe('parseFeed — listing metadata (#116)', () => {
  it('exposes RSS 2.0 feed metadata', async () => {
    const feed = await parseFeed(RSS20);
    expect(feed.metadata).toMatchObject({
      description: 'A sample feed',
      siteUrl: 'https://example.com/',
      imageUrl: 'https://example.com/logo.png',
    });
  });

  it('exposes Atom feed metadata, keeping subtitle', async () => {
    const feed = await parseFeed(ATOM);
    expect(feed.metadata).toMatchObject({
      description: 'Subtitle text',
      subtitle: 'Subtitle text',
      siteUrl: 'https://example.com/',
    });
  });

  it('records where each entry id came from without changing the ids', async () => {
    const rss = await parseFeed(RSS20);
    expect(rss.entries.map((entry) => [entry.id, entry.metadata.entryIdSource])).toEqual([
      ['post-1', 'guid'],
      ['https://example.com/2', 'link'],
    ]);

    const atom = await parseFeed(ATOM);
    expect(atom.entries[0]!.metadata.entryIdSource).toBe('atom-id');

    const rdf = await parseFeed(RSS10);
    expect(rdf.entries[0]!.id).toBe('https://example.com/1');
    expect(rdf.entries[0]!.metadata.entryIdSource).toBe('rdf-about');

    const hashed = await parseFeed(
      '<rss version="2.0"><channel><title>t</title><item><title>X</title><description>d</description></item></channel></rss>',
    );
    expect(hashed.entries[0]!.metadata.entryIdSource).toBe('fallback');

    const atomLinkOnly = await parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><entry><title>E</title><link href="https://example.com/e"/></entry></feed>',
    );
    expect(atomLinkOnly.entries[0]!.metadata.entryIdSource).toBe('link');
  });

  it('types enclosures and keeps media:content separate', async () => {
    const feed =
      await parseFeed(`<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>t</title>
      <item><title>Mixed</title><link>https://example.com/a</link><guid>a</guid>
        <media:content url="https://example.com/thumb.jpg" type="image/jpeg" medium="image"/>
        <enclosure url="https://example.com/ep.mp3" type="Audio/MPEG" length="5000"/>
        <enclosure url="https://example.com/ep.m4a" type="audio/mp4" length="bad"/>
      </item>
      <item><title>Image only</title><link>https://example.com/b</link><guid>b</guid>
        <media:content url="https://example.com/pic.png" medium="image"/>
      </item>
    </channel></rss>`);
    const [mixed, imageOnly] = feed.entries;
    expect(mixed!.metadata.enclosures).toEqual([
      { url: 'https://example.com/ep.mp3', type: 'audio/mpeg', length: 5000 },
      { url: 'https://example.com/ep.m4a', type: 'audio/mp4' },
    ]);
    expect(mixed!.metadata.media).toEqual([
      { url: 'https://example.com/thumb.jpg', type: 'image/jpeg', medium: 'image' },
    ]);
    expect(mixed!.metadata.enclosureUrl).toBe('https://example.com/ep.mp3');

    expect(imageOnly!.metadata.enclosures).toBeUndefined();
    expect(imageOnly!.metadata.media).toEqual([
      { url: 'https://example.com/pic.png', medium: 'image' },
    ]);
    expect(imageOnly!.metadata.enclosureUrl).toBe('https://example.com/pic.png');
  });

  it('types Atom enclosure links', async () => {
    const feed = await parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><entry><id>x</id><title>E</title>' +
        '<link rel="alternate" href="https://example.com/e"/>' +
        '<link rel="enclosure" href="https://example.com/e.mp3" type="audio/mpeg" length="42"/></entry></feed>',
    );
    expect(feed.entries[0]!.metadata.enclosures).toEqual([
      { url: 'https://example.com/e.mp3', type: 'audio/mpeg', length: 42 },
    ]);
  });

  it('carries entry metadata onto listed items', async () => {
    const feed = await parseFeed(RSS20);
    const item = entryToItem(feed.entries[0]!, 'https://example.com/feed.xml');
    expect(item.metadata).toMatchObject({
      entryId: 'post-1',
      entryIdSource: 'guid',
      enclosureUrl: 'https://example.com/audio.mp3',
      enclosures: [{ url: 'https://example.com/audio.mp3', type: 'audio/mpeg', length: 1234 }],
      duration: '45:00',
      categories: ['tech'],
    });
  });
});

describe('parseFeed — decoded media and image URLs', () => {
  it('decodes entities in enclosure, media, and image URLs', async () => {
    const rss =
      await parseFeed(`<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>t</title>
      <itunes:image href="https://ex.com/cover.jpg?w=1&amp;h=1"/>
      <item><guid>a</guid><link>https://ex.com/a</link>
        <enclosure url="https://ex.com/e.mp3?a=1&amp;b=2" type="audio/mpeg"/>
        <media:content url="https://ex.com/t.jpg?x=1&amp;y=2" medium="image"/>
      </item></channel></rss>`);
    expect(rss.metadata.imageUrl).toBe('https://ex.com/cover.jpg?w=1&h=1');
    expect(rss.entries[0]!.metadata.enclosures).toEqual([
      { url: 'https://ex.com/e.mp3?a=1&b=2', type: 'audio/mpeg' },
    ]);
    expect(rss.entries[0]!.metadata.media).toEqual([
      { url: 'https://ex.com/t.jpg?x=1&y=2', medium: 'image' },
    ]);
    expect(rss.entries[0]!.metadata.enclosureUrl).toBe('https://ex.com/e.mp3?a=1&b=2');

    const atom = await parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><icon>https://ex.com/i.png?w=1&amp;h=1</icon>' +
        '<entry><id>x</id><link rel="enclosure" href="https://ex.com/e.mp3?a=1&amp;b=2"/></entry></feed>',
    );
    expect(atom.metadata.imageUrl).toBe('https://ex.com/i.png?w=1&h=1');
    expect(atom.entries[0]!.metadata.enclosures).toEqual([{ url: 'https://ex.com/e.mp3?a=1&b=2' }]);
  });
});

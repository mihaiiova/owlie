/**
 * Sanitized RSS/Atom fixtures for offline characterization tests.
 *
 * These contain no credentials, user data, or real network content. They
 * mirror the structural variety of feeds the parser must handle: RSS 2.0
 * (with podcast `itunes:*`/`content:encoded`/`enclosure`), Atom, Reddit's
 * Atom-in-`.rss`, and RSS 1.0 (RDF).
 */

export const RSS20 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>Example Channel</title>
  <link>https://example.com/</link>
  <description>A sample feed</description>
  <image><url>https://example.com/logo.png</url></image>
  <item>
    <title>First post</title>
    <link>https://example.com/1</link>
    <guid isPermaLink="false">post-1</guid>
    <description>Summary &amp; teaser</description>
    <content:encoded><![CDATA[<p>Full body with <b>markup</b>.</p>]]></content:encoded>
    <pubDate>Tue, 19 Aug 2025 10:00:00 GMT</pubDate>
    <dc:creator>alice</dc:creator>
    <enclosure url="https://example.com/audio.mp3" type="audio/mpeg" length="1234"/>
    <itunes:duration>45:00</itunes:duration>
    <category>tech</category>
  </item>
  <item>
    <title>Second post</title>
    <link>https://example.com/2</link>
    <description>No guid here</description>
    <pubDate>Wed, 20 Aug 2025 11:00:00 GMT</pubDate>
  </item>
</channel>
</rss>`;

export const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <subtitle>Subtitle text</subtitle>
  <link rel="self" href="https://example.com/feed"/>
  <link rel="alternate" href="https://example.com/"/>
  <entry>
    <title>Atom entry one</title>
    <id>tag:example.com,2025:1</id>
    <link rel="alternate" href="https://example.com/entries/1"/>
    <summary>A summary</summary>
    <content type="html">&lt;p&gt;Body &amp; text&lt;/p&gt;</content>
    <updated>2025-08-19T10:00:00Z</updated>
    <author><name>Bob</name></author>
  </entry>
</feed>`;

export const REDDIT_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>r/LocalLLaMA</title>
  <entry>
    <title>A reddit post title</title>
    <id>t3_1abc123</id>
    <link rel="alternate" href="https://www.reddit.com/r/LocalLLaMA/comments/1abc123/title/"/>
    <author><name>/u/someuser</name></author>
    <content type="html">&lt;div class="md"&gt;Post body&lt;/div&gt;</content>
    <updated>2025-08-19T12:00:00+00:00</updated>
  </entry>
</feed>`;

export const RSS10 = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com/">
    <title>RDF Channel</title>
    <link>https://example.com/</link>
    <description>RDF feed</description>
  </channel>
  <item rdf:about="https://example.com/1">
    <title>RDF item</title>
    <link>https://example.com/1</link>
    <description>RDF body</description>
    <dc:date>2025-08-19T10:00:00Z</dc:date>
    <dc:creator>carol</dc:creator>
  </item>
</rdf:RDF>`;

/** A feed-shaped billion-laughs payload: must be rejected, never expanded. */
export const BILLION_LAUGHS = `<?xml version="1.0"?>
<!DOCTYPE rss [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<rss version="2.0"><channel><title>&lol3;</title></channel></rss>`;

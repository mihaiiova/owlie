import { describe, expect, it } from 'vitest';
import {
  hackerNewsHtmlToText,
  hackerNewsKind,
  isHackerNewsUrl,
  parseHackerNewsUrl,
  renderDiscussion,
} from '../src/hackernews.js';

describe('parseHackerNewsUrl', () => {
  it.each([
    ['https://news.ycombinator.com/', 'top', 'https://news.ycombinator.com/news'],
    ['https://news.ycombinator.com', 'top', 'https://news.ycombinator.com/news'],
    ['https://news.ycombinator.com/news', 'top', 'https://news.ycombinator.com/news'],
    ['http://news.ycombinator.com/news?p=2', 'top', 'https://news.ycombinator.com/news'],
    ['https://news.ycombinator.com/newest', 'new', 'https://news.ycombinator.com/newest'],
    ['https://news.ycombinator.com/best', 'best', 'https://news.ycombinator.com/best'],
    ['https://news.ycombinator.com/ask', 'ask', 'https://news.ycombinator.com/ask'],
    ['https://NEWS.ycombinator.com/show/', 'show', 'https://news.ycombinator.com/show'],
  ])('recognizes the list %s', (url, list, canonicalUrl) => {
    expect(parseHackerNewsUrl(url)).toEqual({
      kind: 'list',
      list,
      collectionId: `hackernews:list:${list}`,
      canonicalUrl,
    });
  });

  it('recognizes a user submissions page', () => {
    expect(parseHackerNewsUrl('https://news.ycombinator.com/submitted?id=pg&p=2')).toEqual({
      kind: 'user',
      user: 'pg',
      collectionId: 'hackernews:user:pg',
      canonicalUrl: 'https://news.ycombinator.com/submitted?id=pg',
    });
  });

  it('recognizes an item page', () => {
    expect(parseHackerNewsUrl('https://news.ycombinator.com/item?id=8863#comments')).toEqual({
      kind: 'item',
      id: 8863,
      itemId: 'hackernews:item:8863',
      canonicalUrl: 'https://news.ycombinator.com/item?id=8863',
    });
  });

  it.each([
    'https://news.ycombinator.com/rss',
    'https://news.ycombinator.com/front',
    'https://news.ycombinator.com/jobs',
    'https://news.ycombinator.com/item',
    'https://news.ycombinator.com/item?id=abc',
    'https://news.ycombinator.com/item?id=0',
    'https://news.ycombinator.com/submitted',
    'https://news.ycombinator.com/submitted?id=a%20b',
    'https://news.ycombinator.com:8443/news',
    'https://user:pass@news.ycombinator.com/news',
    'https://ycombinator.com/news',
    'https://example.com/item?id=1',
    'ftp://news.ycombinator.com/news',
    'not a url',
  ])('does not claim %s', (url) => {
    expect(parseHackerNewsUrl(url)).toBeNull();
    expect(isHackerNewsUrl(url)).toBe(false);
  });
});

describe('hackerNewsKind', () => {
  it('takes jobs and polls from the API type', () => {
    expect(hackerNewsKind('job', 'Acme is hiring')).toBe('job');
    expect(hackerNewsKind('poll', 'Which editor?')).toBe('poll');
  });

  it('takes Ask and Show from the list, then the title prefix', () => {
    expect(hackerNewsKind('story', 'Plain title', 'ask')).toBe('ask');
    expect(hackerNewsKind('story', 'Plain title', 'show')).toBe('show');
    expect(hackerNewsKind('story', 'Ask HN: Why?')).toBe('ask');
    expect(hackerNewsKind('story', ' show hn: a thing')).toBe('show');
    expect(hackerNewsKind('story', 'Plain title', 'top')).toBe('story');
  });
});

describe('hackerNewsHtmlToText', () => {
  it('turns paragraphs into blank lines and decodes entities once', () => {
    expect(hackerNewsHtmlToText('It&#x27;s <i>fine</i>.<p>A &amp;amp; B')).toBe(
      "It's fine.\n\nA &amp; B",
    );
  });

  it('keeps a shortened link as its full URL', () => {
    expect(
      hackerNewsHtmlToText(
        'See <a href="https:&#x2F;&#x2F;example.com&#x2F;a&#x2F;long&#x2F;path">https:&#x2F;&#x2F;example.com&#x2F;a&#x2F;lo...</a>',
      ),
    ).toBe('See https://example.com/a/long/path');
  });

  it('keeps a labelled link as label and URL', () => {
    expect(hackerNewsHtmlToText('<a href="https://example.com/">the docs</a>')).toBe(
      'the docs (https://example.com/)',
    );
  });

  it('preserves code block lines', () => {
    expect(hackerNewsHtmlToText('Code:<pre><code>  a &lt; b\n  b &gt; c\n</code></pre>After')).toBe(
      'Code:\n\n  a < b\n  b > c\n\nAfter',
    );
  });

  it('returns an empty string for missing text', () => {
    expect(hackerNewsHtmlToText(undefined)).toBe('');
  });
});

describe('renderDiscussion', () => {
  it('renders the header, post text, and indented comment tree', () => {
    const text = renderDiscussion(
      {
        title: 'A title',
        hnUrl: 'https://news.ycombinator.com/item?id=1',
        linkUrl: 'https://example.com/',
        author: 'alice',
        score: 5,
        commentCount: 2,
        publishedAt: '2026-01-01T00:00:00.000Z',
        text: 'Post text',
      },
      [
        {
          author: 'c1',
          text: 'Top\n\nSecond line',
          replies: [{ author: 'r1', text: 'Reply', replies: [] }],
        },
      ],
    );
    expect(text).toBe(
      [
        'A title',
        'Link: https://example.com/',
        'Hacker News: https://news.ycombinator.com/item?id=1',
        'by alice · 5 points · 2 comments · 2026-01-01T00:00:00.000Z',
        '',
        'Post text',
        '',
        'Comments:',
        '',
        '[c1]',
        '  Top',
        '',
        '  Second line',
        '',
        '    [r1]',
        '      Reply',
      ].join('\n'),
    );
  });
});

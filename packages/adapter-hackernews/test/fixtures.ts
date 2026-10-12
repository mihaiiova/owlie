import type { HttpFetcher } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';

export const API = 'https://hacker-news.firebaseio.com/v0';

/** Sanitized official-API items keyed by id (shapes follow the real API). */
export const ITEMS: Record<number, unknown> = {
  100: {
    id: 100,
    type: 'story',
    by: 'alice',
    time: 1_760_000_000,
    title: 'A useful tool',
    url: 'https://example.com/tool',
    score: 120,
    descendants: 6,
    kids: [200, 201, 202],
  },
  101: {
    id: 101,
    type: 'story',
    by: 'bob',
    time: 1_760_000_100,
    title: 'Ask HN: How do you test?',
    text: 'I&#x27;m curious.<p>See <a href="https:&#x2F;&#x2F;example.com&#x2F;notes" rel="nofollow">https:&#x2F;&#x2F;example.com&#x2F;no...</a>',
    score: 40,
    descendants: 0,
  },
  102: { id: 102, type: 'story', deleted: true },
  103: { id: 103, type: 'story', by: 'carol', title: 'Dead story', dead: true },
  104: { id: 104, type: 'comment', by: 'dave', text: 'a comment', parent: 100 },
  105: {
    id: 105,
    type: 'job',
    by: 'acme',
    time: 1_760_000_200,
    title: 'Acme is hiring',
    url: 'http://127.0.0.1/admin',
  },
  106: {
    id: 106,
    type: 'story',
    by: 'erin',
    time: 1_760_000_300,
    title: 'Show HN: My project',
    url: 'https://example.com/project',
    score: 10,
    descendants: 0,
  },
  200: {
    id: 200,
    type: 'comment',
    by: 'c1',
    text: 'First <i>top</i> comment.<p>Code:<pre><code>  a &lt; b\n  b &gt; c\n</code></pre>',
    kids: [300, 301],
  },
  201: { id: 201, type: 'comment', deleted: true },
  202: { id: 202, type: 'comment', by: 'c3', text: 'Third comment', kids: [302] },
  300: { id: 300, type: 'comment', by: 'r1', text: 'Reply one', kids: [400] },
  301: { id: 301, type: 'comment', by: 'r2', text: 'Reply two', dead: true },
  302: { id: 302, type: 'comment', by: 'r3', text: 'Reply three' },
  400: { id: 400, type: 'comment', by: 'd1', text: 'Deep reply' },
};

export const LISTS: Record<string, unknown> = {
  topstories: [102, 100, 103, 104, 105, 106, 101],
  newstories: [106, 105],
  beststories: [100],
  askstories: [101],
  showstories: [106],
};

export const USERS: Record<string, unknown> = {
  alice: { id: 'alice', submitted: [104, 104, 104, 104, 104, 104, 100] },
};

/** A fake fetcher serving the fixtures as the official API would, recording calls. */
export function fakeApi(
  overrides: Record<string, { contentType: string | null; text: string }> = {},
) {
  const calls: string[] = [];
  const fetcher: HttpFetcher = {
    async fetch(url) {
      calls.push(url);
      if (overrides[url]) return { url, ...overrides[url] };
      const path = url.startsWith(API) ? url.slice(API.length) : undefined;
      let body: unknown;
      const item = path?.match(/^\/item\/(\d+)\.json$/);
      const list = path?.match(/^\/(\w+)\.json$/);
      const user = path?.match(/^\/user\/([\w-]+)\.json$/);
      if (item) body = ITEMS[Number(item[1])] ?? null;
      else if (user) body = USERS[user[1]!] ?? null;
      else if (list && LISTS[list[1]!] !== undefined) body = LISTS[list[1]!];
      else throw new ExtractionError(`unexpected fetch: ${url}`);
      return { url, contentType: 'application/json; charset=utf-8', text: JSON.stringify(body) };
    },
  };
  return { fetcher, calls };
}

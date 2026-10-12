import { decodeHTML } from 'entities';

/** The Hacker News host this adapter recognizes. */
export const HACKER_NEWS_HOST = 'news.ycombinator.com';

/** The official Hacker News API base URL. */
export const HACKER_NEWS_API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';

/** The story lists the adapter can read. */
export type HackerNewsList = 'top' | 'new' | 'best' | 'ask' | 'show';

/** The kind of a listed or extracted Hacker News post. */
export type HackerNewsKind = 'story' | 'ask' | 'show' | 'job' | 'poll';

/** A recognized Hacker News URL. */
export type HackerNewsLocation =
  | { kind: 'list'; list: HackerNewsList; collectionId: string; canonicalUrl: string }
  | { kind: 'user'; user: string; collectionId: string; canonicalUrl: string }
  | { kind: 'item'; id: number; itemId: string; canonicalUrl: string };

const LIST_PATHS: Readonly<Record<string, HackerNewsList>> = {
  '/': 'top',
  '/news': 'top',
  '/newest': 'new',
  '/best': 'best',
  '/ask': 'ask',
  '/show': 'show',
};

/** The site path of each list (the canonical URL path). */
const LIST_CANONICAL_PATHS: Readonly<Record<HackerNewsList, string>> = {
  top: '/news',
  new: '/newest',
  best: '/best',
  ask: '/ask',
  show: '/show',
};

/** The official API endpoint of each list. */
export const LIST_ENDPOINTS: Readonly<Record<HackerNewsList, string>> = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
  ask: 'askstories',
  show: 'showstories',
};

/** Hacker News user names: letters, digits, dashes and underscores. */
const USER_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const ITEM_ID_PATTERN = /^[1-9]\d{0,11}$/;

/** The stable item identity for a Hacker News item id. */
export function hackerNewsItemId(id: number): string {
  return `hackernews:item:${id}`;
}

/** The canonical Hacker News page of an item. */
export function hackerNewsItemUrl(id: number): string {
  return `https://${HACKER_NEWS_HOST}/item?id=${id}`;
}

/**
 * Recognizes a Hacker News list, user-submissions, or item URL. Pure and
 * network-free. Page parameters (`?p=2`) are ignored. `/rss` and every other
 * path return `null`, so the generic RSS path keeps the site's own feed.
 */
export function parseHackerNewsUrl(input: string): HackerNewsLocation | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.hostname.toLowerCase() !== HACKER_NEWS_HOST) return null;
  if (url.port !== '') return null;

  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const list = LIST_PATHS[path];
  if (list !== undefined) {
    return {
      kind: 'list',
      list,
      collectionId: `hackernews:list:${list}`,
      canonicalUrl: `https://${HACKER_NEWS_HOST}${LIST_CANONICAL_PATHS[list]}`,
    };
  }
  if (path === '/submitted') {
    const user = url.searchParams.get('id');
    if (user === null || !USER_PATTERN.test(user)) return null;
    return {
      kind: 'user',
      user,
      collectionId: `hackernews:user:${user}`,
      canonicalUrl: `https://${HACKER_NEWS_HOST}/submitted?id=${user}`,
    };
  }
  if (path === '/item') {
    const raw = url.searchParams.get('id');
    if (raw === null || !ITEM_ID_PATTERN.test(raw)) return null;
    const id = Number(raw);
    return { kind: 'item', id, itemId: hackerNewsItemId(id), canonicalUrl: hackerNewsItemUrl(id) };
  }
  return null;
}

/** Whether a URL is a Hacker News URL this adapter handles. Pure. */
export function isHackerNewsUrl(input: string): boolean {
  return parseHackerNewsUrl(input) !== null;
}

/**
 * The kind of a post from its API `type`, the list it came from, and its
 * title prefix ("Ask HN:" / "Show HN:").
 */
export function hackerNewsKind(
  type: string | undefined,
  title: string | undefined,
  list?: HackerNewsList,
): HackerNewsKind {
  if (type === 'job') return 'job';
  if (type === 'poll') return 'poll';
  if (list === 'ask') return 'ask';
  if (list === 'show') return 'show';
  const heading = (title ?? '').trimStart().toLowerCase();
  if (heading.startsWith('ask hn:')) return 'ask';
  if (heading.startsWith('show hn:')) return 'show';
  return 'story';
}

const ANCHOR_PATTERN = /<a\s[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
const PRE_PATTERN = /<pre>\s*(?:<code>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Converts the limited HTML Hacker News uses in text fields (`<p>`, `<a>`,
 * `<i>`, `<pre><code>`) into plain text: paragraphs become blank lines, links
 * keep their URL, entities are decoded, and code blocks keep their lines.
 */
export function hackerNewsHtmlToText(html: string | undefined): string {
  if (!html) return '';
  const blocks: string[] = [];
  const withPlaceholders = html.replace(PRE_PATTERN, (_match, code: string) => {
    blocks.push(decodeHTML(stripTags(code)).replace(/\s+$/, ''));
    return `\n\n\uE000${blocks.length - 1}\uE000\n\n`;
  });
  const linked = withPlaceholders.replace(
    ANCHOR_PATTERN,
    (_match, _quoted, double: string | undefined, single: string | undefined, label: string) => {
      // Compare decoded values but emit raw ones: the whole text is decoded once below.
      const rawHref = double ?? single ?? '';
      const rawText = stripTags(label).trim();
      const href = decodeHTML(rawHref);
      const text = decodeHTML(rawText);
      // HN shortens long link text ("https://example.com/a/very/lo...").
      if (text === '' || text === href || text.endsWith('...') || href.startsWith(text)) {
        return rawHref;
      }
      return `${rawText} (${rawHref})`;
    },
  );
  const text = decodeHTML(stripTags(linked.replace(/<p>/gi, '\n\n')));
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').trim())
    .filter((paragraph) => paragraph !== '');
  return paragraphs
    .join('\n\n')
    .replace(/\uE000(\d+)\uE000/g, (_match, index: string) => blocks[Number(index)] ?? '');
}

/** One rendered comment in a discussion tree. */
export interface HackerNewsComment {
  author: string;
  text: string;
  replies: HackerNewsComment[];
}

/** The facts rendered at the top of a discussion document. */
export interface HackerNewsStoryHeader {
  title: string;
  hnUrl: string;
  linkUrl?: string;
  author?: string;
  score?: number;
  commentCount?: number;
  publishedAt?: string;
  text?: string;
}

function indentLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '' : `${prefix}${line}`))
    .join('\n');
}

function renderComment(comment: HackerNewsComment, depth: number, lines: string[]): void {
  const indent = '    '.repeat(depth);
  lines.push(`${indent}[${comment.author}]`);
  lines.push(indentLines(comment.text, `${indent}  `));
  lines.push('');
  for (const reply of comment.replies) renderComment(reply, depth + 1, lines);
}

/**
 * Renders a discussion as plain text: a header (title, link, author, score,
 * comment count, date), the post text, and the comment tree in HN's ranked
 * order with each reply level indented.
 */
export function renderDiscussion(
  header: HackerNewsStoryHeader,
  comments: readonly HackerNewsComment[],
): string {
  const lines: string[] = [header.title];
  if (header.linkUrl) lines.push(`Link: ${header.linkUrl}`);
  lines.push(`Hacker News: ${header.hnUrl}`);
  const facts = [
    header.author ? `by ${header.author}` : undefined,
    header.score === undefined ? undefined : `${header.score} points`,
    header.commentCount === undefined ? undefined : `${header.commentCount} comments`,
    header.publishedAt,
  ].filter((fact): fact is string => fact !== undefined);
  if (facts.length > 0) lines.push(facts.join(' · '));
  if (header.text) lines.push('', header.text);
  if (comments.length > 0) {
    lines.push('', 'Comments:', '');
    for (const comment of comments) renderComment(comment, 0, lines);
  }
  return lines.join('\n').trimEnd();
}

/**
 * Pure, network-free recognition of arXiv URLs: single papers (abstract, PDF
 * and HTML pages) and collections (category feeds and API search queries).
 */

/** A paper reference: the version-less identifier and, when given, the version. */
export interface ArxivPaperRef {
  /** New-style `2401.12345` or old-style `hep-th/9901001`. */
  id: string;
  /** `v2`, when the URL names a version. */
  version?: string;
}

export type ArxivCollectionRef =
  { kind: 'category'; categories: string[] } | { kind: 'query'; query: string };

const PAPER_HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'export.arxiv.org']);
const RSS_HOSTS = new Set(['rss.arxiv.org', 'export.arxiv.org']);

const NEW_STYLE_ID = /^(\d{4}\.\d{4,5})(v\d+)?$/;
const OLD_STYLE_ID = /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/;
const CATEGORY = /^[a-z-]+(?:\.[A-Za-z-]+)?$/;

function parseUrl(input: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  return url;
}

function parsePaperId(path: string): ArxivPaperRef | undefined {
  const cleaned = path.replace(/\.pdf$/i, '');
  const match = NEW_STYLE_ID.exec(cleaned) ?? OLD_STYLE_ID.exec(cleaned);
  if (!match) return undefined;
  return match[2] ? { id: match[1]!, version: match[2] } : { id: match[1]! };
}

/** Recognizes an arXiv paper URL (`/abs/`, `/pdf/` or `/html/`), with or without a version. */
export function parseArxivPaperUrl(input: string): ArxivPaperRef | undefined {
  const url = parseUrl(input);
  if (!url || !PAPER_HOSTS.has(url.hostname.toLowerCase())) return undefined;
  const match = /^\/(abs|pdf|html)\/(.+)$/.exec(url.pathname);
  if (!match) return undefined;
  let rest = match[2]!.replace(/\/+$/, '');
  // An HTML render can carry a trailing page (`/index.html`) or section path.
  if (match[1] === 'html') {
    const segments = rest.split('/');
    rest = /^\d{4}\./.test(segments[0]!) ? segments[0]! : segments.slice(0, 2).join('/');
  }
  return parsePaperId(rest);
}

function parseCategories(value: string): string[] | undefined {
  const categories = value.split('+');
  return categories.every((category) => CATEGORY.test(category)) ? categories : undefined;
}

/**
 * Recognizes an arXiv collection: a category announcement feed
 * (`rss.arxiv.org/rss/<cat>[+<cat>…]`, `/atom/`, the legacy
 * `export.arxiv.org/rss/<cat>`, or a `arxiv.org/list/<cat>/…` page) or an API
 * search query (`export.arxiv.org/api/query?search_query=…`).
 */
export function parseArxivCollectionUrl(input: string): ArxivCollectionRef | undefined {
  const url = parseUrl(input);
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, '');

  if (RSS_HOSTS.has(host)) {
    const feed = /^\/(?:rss|atom)\/([^/]+)$/.exec(path);
    if (feed) {
      const categories = parseCategories(decodeURIComponent(feed[1]!));
      return categories ? { kind: 'category', categories } : undefined;
    }
  }
  if (PAPER_HOSTS.has(host)) {
    const list = /^\/list\/([^/]+)(?:\/(?:new|recent|pastweek|current))?$/.exec(path);
    if (list) {
      const categories = parseCategories(list[1]!);
      return categories ? { kind: 'category', categories } : undefined;
    }
    if (path === '/api/query') {
      const query = url.searchParams.get('search_query')?.replace(/\s+/g, ' ').trim();
      return query ? { kind: 'query', query } : undefined;
    }
  }
  return undefined;
}

/** Whether a URL is an arXiv paper or collection this adapter reads. */
export function isArxivUrl(input: string): boolean {
  return parseArxivPaperUrl(input) !== undefined || parseArxivCollectionUrl(input) !== undefined;
}

/** The canonical abstract page of a paper. */
export function arxivAbsUrl(id: string, version?: string): string {
  return `https://arxiv.org/abs/${id}${version ?? ''}`;
}

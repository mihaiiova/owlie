import { ExtractionError, NotImplementedError } from '@owlieio/core';

export type FeedFormat = 'atom' | 'rss';

export interface ParsedEntry {
  id: string;
  title?: string;
  url?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  author?: string;
  metadata: Record<string, unknown>;
}

export interface ParsedFeed {
  format: FeedFormat;
  title?: string;
  canonicalUrl?: string;
  entries: ParsedEntry[];
  metadata: Record<string, unknown>;
}

/**
 * Detects the feed format from the document body by inspecting the root
 * element. This is intentionally content-aware rather than extension-based:
 * Reddit's `.rss` endpoints return Atom XML, for example.
 */
export function detectFeedFormat(input: string): FeedFormat | null {
  const head = input
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trimStart()
    .slice(0, 512);

  if (/^<feed(?:\s|>)/i.test(head)) return 'atom';
  if (/^<rss(?:\s|>)/i.test(head)) return 'rss';
  if (/^<rdf:RDF(?:\s|>)/i.test(head)) return 'rss';
  return null;
}

/**
 * Parses an RSS or Atom document into a provider-neutral {@link ParsedFeed}.
 * The safe parser implementation (with XML entity-expansion protection) lands
 * with extraction work; this scaffold never performs real parsing.
 */
export async function parseFeed(xml: string): Promise<ParsedFeed> {
  const format = detectFeedFormat(xml);
  if (!format) {
    throw new ExtractionError('input does not look like an RSS or Atom document');
  }
  throw new NotImplementedError(
    `RSS/Atom parsing is not implemented yet (detected format: ${format})`,
  );
}

export function normalizeFeedUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  return url.toString();
}

const FEED_SUFFIXES = ['.rss', '.atom', '.xml', '/feed', '/feed/', '/rss', '/rss/'];

export function isFeedUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const path = url.pathname.toLowerCase();
    return FEED_SUFFIXES.some((suffix) => path.endsWith(suffix));
  } catch {
    return false;
  }
}

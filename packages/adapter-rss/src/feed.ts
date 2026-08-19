import { ExtractionError } from '@owlieio/core';
import { decodeHTML } from 'entities';
import { XMLParser } from 'fast-xml-parser';

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
 * Decodes XML/HTML character references (named and numeric) into literal text.
 *
 * This is a pure string substitution against the standard HTML entity table —
 * it never parses DTDs or expands document-defined entities, so a
 * billion-laughs payload is left as literal `&lol2;` text rather than being
 * expanded. We rely on this instead of the XML parser's own entity handling
 * (which is disabled via `processEntities: false`).
 */
export function decodeXmlEntities(input: string): string {
  return decodeHTML(input);
}

/**
 * Converts feed-provided HTML (e.g. `content:encoded` or Atom `content`) into
 * plain text: scripts and styles are removed, remaining markup is stripped,
 * and character references are decoded.
 */
export function htmlToText(html: string): string {
  return decodeHTML(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// ---------------------------------------------------------------------------
// XML parsing
// ---------------------------------------------------------------------------

/**
 * Safe parser configuration for untrusted input: entity expansion is fully
 * disabled (`processEntities: false`), namespace prefixes are preserved so
 * `content:encoded`/`itunes:duration`/`dc:creator` are distinguishable, tag
 * values stay strings (no accidental number coercion of GUIDs or dates), and
 * repeatable elements are normalized to arrays.
 */
const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (tagName: string) =>
    ['item', 'entry', 'link', 'author', 'category', 'enclosure'].includes(tagName),
};

const DTD_PATTERN = /<\s*!\s*(?:DOCTYPE|ENTITY)/i;

/**
 * Parses an RSS or Atom document into a provider-neutral {@link ParsedFeed}.
 *
 * @throws {ExtractionError} for non-feed input, malformed XML, or documents
 *   that carry a DTD/entity declaration (an XXE/billion-laughs vector).
 */
export async function parseFeed(xml: string): Promise<ParsedFeed> {
  if (DTD_PATTERN.test(xml)) {
    throw new ExtractionError('feed contains a DTD or entity declaration, which is not supported');
  }

  const format = detectFeedFormat(xml);
  if (!format) {
    throw new ExtractionError('input does not look like an RSS or Atom document');
  }

  let doc: unknown;
  try {
    doc = new XMLParser(XML_OPTIONS).parse(xml);
  } catch (error) {
    throw new ExtractionError(`failed to parse feed XML: ${describe(error)}`, { cause: error });
  }
  if (!isRecord(doc)) {
    throw new ExtractionError('feed XML did not produce a document');
  }

  return format === 'atom' ? parseAtom(doc) : parseRss(doc);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** Extracts the text of a parsed node (a string, or `{ "#text": ... }`). */
function rawText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (isRecord(value)) {
    const text = value['#text'];
    if (typeof text === 'string') return text;
    if (typeof text === 'number') return String(text);
  }
  return undefined;
}

/** Extracts, decodes, and trims the text of a parsed node. */
function clean(value: unknown): string | undefined {
  const raw = rawText(value);
  if (raw === undefined) return undefined;
  const decoded = decodeXmlEntities(raw).trim();
  return decoded === '' ? undefined : decoded;
}

function firstText(value: unknown): string | undefined {
  return clean(first(value));
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function fallbackId(...parts: Array<string | undefined>): string {
  const joined = parts.filter((part) => part !== undefined && part !== '').join('\u0000');
  return `entry-${hashString(joined === '' ? 'unidentified' : joined)}`;
}

function compact(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}

function assign(
  entry: ParsedEntry,
  key: 'title' | 'url' | 'description' | 'content' | 'publishedAt' | 'author',
  value: string | undefined,
): void {
  if (value !== undefined) entry[key] = value;
}

// ---------------------------------------------------------------------------
// Atom
// ---------------------------------------------------------------------------

function parseAtom(doc: Record<string, unknown>): ParsedFeed {
  const feed = isRecord(doc.feed) ? doc.feed : {};
  const entries = toArray(feed.entry)
    .map(parseAtomEntry)
    .filter((entry): entry is ParsedEntry => entry !== null);

  return {
    format: 'atom',
    title: clean(feed.title),
    canonicalUrl:
      atomLink(feed.link, 'self') ?? atomLink(feed.link, 'alternate') ?? atomLink(feed.link),
    entries,
    metadata: compact({
      subtitle: clean(feed.subtitle),
      imageUrl: atomIcon(feed),
    }),
  };
}

/** Returns the href of an Atom `<link>` with the given rel (or any link). */
function atomLink(link: unknown, rel?: string): string | undefined {
  for (const item of toArray<unknown>(link)) {
    if (!isRecord(item)) continue;
    const href = item['@_href'];
    if (typeof href !== 'string') continue;
    if (rel === undefined) return href;
    const itemRel = item['@_rel'];
    if (itemRel === rel) return href;
    // Atom `<link>` without a rel defaults to "alternate".
    if (rel === 'alternate' && (itemRel === undefined || itemRel === '')) return href;
  }
  return undefined;
}

function atomIcon(feed: Record<string, unknown>): string | undefined {
  if (typeof feed.icon === 'string') return feed.icon;
  if (typeof feed.logo === 'string') return feed.logo;
  return undefined;
}

function atomAuthor(author: unknown): string | undefined {
  const firstAuthor = first(author);
  if (!isRecord(firstAuthor)) return undefined;
  return clean(firstAuthor.name) ?? clean(firstAuthor.email);
}

function parseAtomEntry(entry: unknown): ParsedEntry | null {
  if (!isRecord(entry)) return null;

  const title = clean(entry.title);
  const atomId = clean(entry.id);
  const url = atomLink(entry.link, 'alternate') ?? atomLink(entry.link);
  const summary = clean(entry.summary);
  const content = clean(entry.content);
  const publishedAt = normalizeDate(clean(entry.updated) ?? clean(entry.published));
  const author = atomAuthor(entry.author);
  const id = atomId ?? url ?? fallbackId(title, publishedAt, summary ?? content);

  const parsed: ParsedEntry = {
    id,
    metadata: compact({ enclosureUrl: atomLink(entry.link, 'enclosure') }),
  };
  assign(parsed, 'title', title);
  assign(parsed, 'url', url);
  assign(parsed, 'description', summary);
  assign(parsed, 'content', content);
  assign(parsed, 'publishedAt', publishedAt);
  assign(parsed, 'author', author);
  return parsed;
}

// ---------------------------------------------------------------------------
// RSS 2.0 and RSS 1.0 (RDF)
// ---------------------------------------------------------------------------

function parseRss(doc: Record<string, unknown>): ParsedFeed {
  const rdf = doc['rdf:RDF'] ?? doc.RDF;
  if (isRecord(rdf)) {
    return parseRss10(rdf);
  }

  const rss = isRecord(doc.rss) ? doc.rss : {};
  const channel = isRecord(rss.channel) ? rss.channel : {};
  const entries = toArray(channel.item)
    .map(parseRss20Entry)
    .filter((entry): entry is ParsedEntry => entry !== null);

  return {
    format: 'rss',
    title: clean(channel.title),
    canonicalUrl: firstText(channel.link),
    entries,
    metadata: compact({
      description: clean(channel.description),
      imageUrl: rssImage(channel),
    }),
  };
}

function parseRss10(rdf: Record<string, unknown>): ParsedFeed {
  const channel = isRecord(rdf.channel) ? rdf.channel : {};
  const entries = toArray(rdf.item)
    .map(parseRss10Entry)
    .filter((entry): entry is ParsedEntry => entry !== null);

  return {
    format: 'rss',
    title: clean(channel.title),
    canonicalUrl: firstText(channel.link),
    entries,
    metadata: compact({ description: clean(channel.description) }),
  };
}

function parseRss20Entry(item: unknown): ParsedEntry | null {
  if (!isRecord(item)) return null;

  const title = clean(item.title);
  const url = firstText(item.link);
  const guid = clean(item.guid);
  const description = clean(item.description);
  const content = clean(item['content:encoded']);
  const publishedAt = normalizeDate(firstText(item.pubDate));
  const author = firstText(item['dc:creator']) ?? firstText(item.author) ?? firstText(item.creator);
  const id = guid ?? url ?? fallbackId(title, publishedAt, description ?? content);

  const parsed: ParsedEntry = {
    id,
    metadata: compact({
      enclosureUrl: enclosureUrl(item),
      duration: clean(item['itunes:duration']),
      categories: categories(item),
    }),
  };
  assign(parsed, 'title', title);
  assign(parsed, 'url', url);
  assign(parsed, 'description', description);
  assign(parsed, 'content', content);
  assign(parsed, 'publishedAt', publishedAt);
  assign(parsed, 'author', author);
  return parsed;
}

function parseRss10Entry(item: unknown): ParsedEntry | null {
  if (!isRecord(item)) return null;

  const title = clean(item.title);
  const url = firstText(item.link);
  const description = clean(item.description);
  const publishedAt = normalizeDate(firstText(item['dc:date']));
  const author = firstText(item['dc:creator']);
  const about = typeof item['@_rdf:about'] === 'string' ? item['@_rdf:about'] : undefined;
  const id = about ?? url ?? fallbackId(title, publishedAt, description);

  const parsed: ParsedEntry = { id, metadata: {} };
  assign(parsed, 'title', title);
  assign(parsed, 'url', url);
  assign(parsed, 'description', description);
  assign(parsed, 'publishedAt', publishedAt);
  assign(parsed, 'author', author);
  return parsed;
}

function enclosureUrl(item: Record<string, unknown>): string | undefined {
  const enclosure = first(item.enclosure);
  if (isRecord(enclosure) && typeof enclosure['@_url'] === 'string') {
    return enclosure['@_url'];
  }
  const media = first(item['media:content']);
  if (isRecord(media) && typeof media['@_url'] === 'string') {
    return media['@_url'];
  }
  return undefined;
}

function categories(item: Record<string, unknown>): string[] | undefined {
  const values = toArray(item.category)
    .map((category) => clean(category))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return values.length > 0 ? values : undefined;
}

function rssImage(channel: Record<string, unknown>): string | undefined {
  const image = first(channel.image);
  if (isRecord(image)) {
    const url = rawText(image.url);
    if (url !== undefined) return decodeXmlEntities(url);
  }
  const itunesImage = first(channel['itunes:image']);
  if (isRecord(itunesImage) && typeof itunesImage['@_href'] === 'string') {
    return itunesImage['@_href'];
  }
  return undefined;
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

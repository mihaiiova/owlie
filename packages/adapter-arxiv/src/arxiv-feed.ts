import { decodeXML } from 'entities';
import { XMLParser } from 'fast-xml-parser';
import { ExtractionError } from '@owlieio/core';
import { parseArxivPaperUrl } from './arxiv-url.js';

/** Paper metadata from the arXiv API (Atom) or an announcement feed (RSS). */
export interface ArxivPaper {
  id: string;
  version?: string;
  title: string;
  authors: string[];
  abstract: string;
  /** First-version submission time (API) or announcement date (RSS), ISO 8601 UTC. */
  published?: string;
  /** Latest-version time, ISO 8601 UTC (API only). */
  updated?: string;
  primaryCategory?: string;
  categories: string[];
  doi?: string;
  journalRef?: string;
  comment?: string;
  /** License URL (announcement feeds only). */
  license?: string;
}

/** A paper as announced in a category feed. */
export interface ArxivAnnouncement extends ArxivPaper {
  /** `new`, `cross`, `replace` or `replace-cross`. */
  announceType: string;
}

// The same safe settings as the RSS/Atom parser (ADR 0009): no entity
// processing by the parser (references are decoded as plain text afterwards),
// and documents with a DTD are refused before parsing.
const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (tagName: string) => ['entry', 'item', 'author', 'category', 'link'].includes(tagName),
};
const DTD_PATTERN = /<\s*!\s*(?:DOCTYPE|ENTITY)/i;

type XmlRecord = Record<string, unknown>;

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseXml(xml: string): XmlRecord {
  if (DTD_PATTERN.test(xml)) {
    throw new ExtractionError('arXiv response contains a DTD or entity declaration');
  }
  let doc: unknown;
  try {
    doc = new XMLParser(XML_OPTIONS).parse(xml);
  } catch (error) {
    throw new ExtractionError('failed to parse arXiv XML', { cause: error });
  }
  return isRecord(doc) ? doc : {};
}

function text(value: unknown): string | undefined {
  const raw = isRecord(value) ? value['#text'] : value;
  if (typeof raw !== 'string') return undefined;
  const cleaned = decodeXML(raw).replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function list(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function parseApiEntry(entry: XmlRecord): ArxivPaper | undefined {
  const ref = parseArxivPaperUrl(text(entry.id) ?? '');
  const title = text(entry.title);
  if (!ref || !title) return undefined;
  const primary = entry['arxiv:primary_category'];
  return compact({
    id: ref.id,
    version: ref.version,
    title,
    authors: list(entry.author)
      .map((author) => (isRecord(author) ? text(author.name) : undefined))
      .filter((name): name is string => name !== undefined),
    abstract: text(entry.summary) ?? '',
    published: isoDate(text(entry.published)),
    updated: isoDate(text(entry.updated)),
    primaryCategory: isRecord(primary) ? text(primary['@_term']) : undefined,
    categories: list(entry.category)
      .map((category) => (isRecord(category) ? text(category['@_term']) : undefined))
      .filter((term): term is string => term !== undefined),
    doi: text(entry['arxiv:doi']),
    journalRef: text(entry['arxiv:journal_ref']),
    comment: text(entry['arxiv:comment']),
  });
}

/** Parses an arXiv API (`/api/query`) Atom response into papers, in result order. */
export function parseArxivApiFeed(xml: string): { papers: ArxivPaper[]; totalResults?: number } {
  const doc = parseXml(xml);
  if (!isRecord(doc.feed)) throw new ExtractionError('not an arXiv API response');
  const feed = doc.feed;
  const total = Number(text(feed['opensearch:totalResults']));
  const papers = list(feed.entry)
    .filter(isRecord)
    .map(parseApiEntry)
    .filter((paper): paper is ArxivPaper => paper !== undefined);
  return { papers, ...(Number.isInteger(total) ? { totalResults: total } : {}) };
}

/** Splits an RSS `dc:creator` list ("A, B and C") into names. */
function splitCreators(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/,\s*|\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseRssItem(item: XmlRecord): ArxivAnnouncement | undefined {
  // The guid is `oai:arXiv.org:<id><version>`.
  const guid = text(item.guid)?.replace(/^oai:arXiv\.org:/i, '');
  const ref = parseArxivPaperUrl(`https://arxiv.org/abs/${guid ?? ''}`);
  const title = text(item.title);
  if (!ref || !title) return undefined;
  const description = text(item.description) ?? '';
  const announceType =
    text(item['arxiv:announce_type']) ?? /Announce Type:\s*(\S+)/.exec(description)?.[1] ?? 'new';
  return compact({
    id: ref.id,
    version: ref.version,
    title,
    authors: splitCreators(text(item['dc:creator'])),
    abstract: description.replace(/^[\s\S]*?Abstract:\s*/, ''),
    published: isoDate(text(item.pubDate)),
    categories: list(item.category)
      .map(text)
      .filter((term): term is string => term !== undefined),
    doi: text(item['arxiv:DOI']),
    journalRef: text(item['arxiv:journal_reference']),
    license: text(item['dc:rights']),
    announceType,
  });
}

/** Parses an arXiv category announcement feed (`rss.arxiv.org/rss/<cat>`). */
export function parseArxivRss(xml: string): { title?: string; entries: ArxivAnnouncement[] } {
  const doc = parseXml(xml);
  const channel = isRecord(doc.rss) && isRecord(doc.rss.channel) ? doc.rss.channel : undefined;
  if (!channel) throw new ExtractionError('not an arXiv RSS feed');
  const entries = list(channel.item)
    .filter(isRecord)
    .map(parseRssItem)
    .filter((entry): entry is ArxivAnnouncement => entry !== undefined);
  const title = text(channel.title);
  return { ...(title ? { title } : {}), entries };
}

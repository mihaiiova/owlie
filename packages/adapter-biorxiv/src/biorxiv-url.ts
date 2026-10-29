/**
 * Pure, network-free recognition of bioRxiv and medRxiv URLs and DOIs:
 * single preprints and subject (or whole-server) collections.
 */
import {
  BIORXIV_SERVERS,
  findSubject,
  type BiorxivServer,
  type BiorxivSubject,
} from './subjects.js';

/** A preprint reference: the lowercased, version-less DOI, and what the URL named. */
export interface BiorxivPaperRef {
  doi: string;
  /** The server whose host the URL is on. */
  server: BiorxivServer;
  /** The version the URL names (`2` for `…v2`). */
  version?: number;
}

export type BiorxivCollectionRef =
  { kind: 'subject'; subject: BiorxivSubject } | { kind: 'server'; server: BiorxivServer };

/**
 * A preprint DOI: the dated `10.1101/YYYY.MM.DD.NNNNNN[NN]` pattern (until
 * 2025; the prefix is shared with Cold Spring Harbor journals, whose DOIs are
 * not dated) or the current `10.64898/YYYY.MM.DD.NNNNNN[NN]`. medRxiv suffixes
 * carry eight digits.
 */
const PREPRINT_DOI = /^(10\.1101|10\.64898)\/(\d{4}\.\d{2}\.\d{2}\.\d{6,8})$/i;

/** A DOI followed by an optional version and page suffix, as in `/content/` paths. */
const CONTENT_PATH =
  /^\/content\/(10\.\d{4,9}\/\d{4}\.\d{2}\.\d{2}\.\d{6,8})(?:v(\d+))?(?:\.(?:full|full\.pdf|full-text|abstract|supplementary-material|article-info|article-metrics))?$/i;

/** An old share link: `/cgi/content/short/<suffix>[vN]` (always the `10.1101` prefix). */
const SHORT_PATH = /^\/cgi\/content\/short\/(\d{4}\.\d{2}\.\d{2}\.\d{6,8})(?:v(\d+))?$/i;

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

/** The server a host belongs to (`biorxiv.org`, `www.medrxiv.org`, …). */
function serverOfHost(host: string): BiorxivServer | undefined {
  const bare = host.toLowerCase().replace(/^www\./, '');
  return BIORXIV_SERVERS.find((server) => bare === `${server}.org`);
}

/** The lowercased DOI when `value` is a bioRxiv/medRxiv preprint DOI. */
function preprintDoi(value: string): string | undefined {
  const match = PREPRINT_DOI.exec(value.trim());
  return match ? `${match[1]!.toLowerCase()}/${match[2]!}` : undefined;
}

/**
 * The lowercased DOI of a bioRxiv or medRxiv preprint, from a bare DOI,
 * `doi:<doi>`, a `doi.org`/`dx.doi.org` link or a preprint URL; `undefined`
 * for anything else (including Cold Spring Harbor journal DOIs). The server
 * cannot be told from the DOI alone.
 */
export function biorxivDoi(input: string): string | undefined {
  const value = input.trim();
  const paper = parseBiorxivPaperUrl(value);
  if (paper) return paper.doi;
  const url = parseUrl(value);
  if (url) {
    const host = url.hostname.toLowerCase();
    if (host !== 'doi.org' && host !== 'dx.doi.org') return undefined;
    let path: string;
    try {
      path = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return undefined;
    }
    return preprintDoi(path.replace(/\/+$/, ''));
  }
  return preprintDoi(value.replace(/^doi:\s*/i, ''));
}

/**
 * Recognizes a preprint URL on `biorxiv.org` or `medrxiv.org`
 * (`/content/<doi>[vN][.full|.full.pdf|.abstract|…]`, or an old
 * `/cgi/content/short/<suffix>` share link).
 */
export function parseBiorxivPaperUrl(input: string): BiorxivPaperRef | undefined {
  const url = parseUrl(input);
  if (!url) return undefined;
  const server = serverOfHost(url.hostname);
  if (!server) return undefined;
  const path = url.pathname.replace(/\/+$/, '');

  const content = CONTENT_PATH.exec(path);
  if (content) {
    const doi = preprintDoi(content[1]!);
    if (!doi) return undefined;
    return { doi, server, ...(content[2] ? { version: Number(content[2]) } : {}) };
  }
  const short = SHORT_PATH.exec(path);
  if (short) {
    return {
      doi: `10.1101/${short[1]!}`,
      server,
      ...(short[2] ? { version: Number(short[2]) } : {}),
    };
  }
  return undefined;
}

/**
 * Recognizes a subject collection (`<server>.org/collection/<subject>`) or a
 * whole server (`<server>.org/collection` or `/collection/all`). An unknown
 * subject is not recognized.
 */
export function parseBiorxivCollectionUrl(input: string): BiorxivCollectionRef | undefined {
  const url = parseUrl(input);
  if (!url) return undefined;
  const server = serverOfHost(url.hostname);
  if (!server) return undefined;
  const match = /^\/collection(?:\/([^/]+))?$/i.exec(url.pathname.replace(/\/+$/, ''));
  if (!match) return undefined;
  if (match[1] === undefined || match[1].toLowerCase() === 'all') return { kind: 'server', server };
  const subject = findSubject(server, decodeURIComponent(match[1]));
  return subject ? { kind: 'subject', subject } : undefined;
}

/**
 * Whether a URL looks like a bioRxiv/medRxiv collection, known subject or not
 * (so the CLI can explain an unknown subject instead of reading the page).
 */
export function isBiorxivCollectionPath(input: string): boolean {
  const url = parseUrl(input);
  if (!url || !serverOfHost(url.hostname)) return false;
  return /^\/collection(?:\/[^/]+)?\/?$/i.test(url.pathname);
}

/** Whether a URL is a bioRxiv/medRxiv preprint or collection this adapter reads. */
export function isBiorxivUrl(input: string): boolean {
  return (
    parseBiorxivPaperUrl(input) !== undefined || parseBiorxivCollectionUrl(input) !== undefined
  );
}

/** The canonical, version-less page of a preprint. */
export function biorxivContentUrl(server: BiorxivServer, doi: string, version?: number): string {
  return `https://www.${server}.org/content/${doi}${version === undefined ? '' : `v${version}`}`;
}

/** The canonical URL of a collection. */
export function biorxivCollectionUrl(ref: BiorxivCollectionRef): string {
  return ref.kind === 'subject'
    ? `https://www.${ref.subject.server}.org/collection/${ref.subject.slug}`
    : `https://www.${ref.server}.org/collection`;
}

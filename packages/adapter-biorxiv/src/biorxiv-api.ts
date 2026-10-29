/**
 * Parsing of `api.biorxiv.org` JSON responses (details and pubs endpoints).
 * Pure: the adapter fetches, these functions only validate and map.
 */
import { ExtractionError } from '@owlieio/core';
import type { BiorxivServer } from './subjects.js';

/** One version of a preprint, as the details endpoint returns it. */
export interface BiorxivRecord {
  /** Lowercased DOI. */
  doi: string;
  title: string;
  /** Ordered author names. */
  authors: string[];
  correspondingAuthor?: string;
  correspondingInstitution?: string;
  /** The date this version was posted (`YYYY-MM-DD`). */
  date?: string;
  version: number;
  /** `new results`, `confirmatory results`, … (medRxiv uses other values). */
  type?: string;
  license?: string;
  category?: string;
  /** DOI of the journal version, when the preprint has been published. */
  published?: string;
  server: BiorxivServer;
  abstract: string;
}

/** One page of the details endpoint. */
export interface BiorxivDetailsPage {
  /** `ok`, or `no posts found` for an empty page. */
  status: string;
  /** The category the API applied (`all` when it did not know the requested one). */
  category?: string;
  /** Records in the whole interval, when the API reports it. */
  total?: number;
  records: BiorxivRecord[];
}

/** Greek letter names the API writes as `{beta}`, mapped to Unicode. */
const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
};

/** Replaces `{beta}`-style Greek letter names with Unicode (`{Delta}` → `Δ`). */
export function decodeGreek(text: string): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (match, name: string) => {
    const lower = GREEK[name.toLowerCase()];
    if (lower === undefined) return match;
    return name[0] === name[0]!.toUpperCase() ? lower.toUpperCase() : lower;
  });
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed === '' || trimmed === 'NA' ? undefined : trimmed;
}

function parseJson(body: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new ExtractionError(`bioRxiv API returned invalid JSON for ${what}`, { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ExtractionError(`bioRxiv API returned an unexpected response for ${what}`);
  }
  return parsed as Record<string, unknown>;
}

function firstMessage(root: Record<string, unknown>): Record<string, unknown> {
  const messages = root.messages;
  const first = Array.isArray(messages) ? messages[0] : undefined;
  return typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : {};
}

function serverOf(value: unknown, fallback: BiorxivServer): BiorxivServer {
  const name = typeof value === 'string' ? value.toLowerCase() : '';
  return name === 'biorxiv' || name === 'medrxiv' ? name : fallback;
}

function parseRecord(value: unknown, server: BiorxivServer): BiorxivRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const doi = text(raw.doi)?.toLowerCase();
  const title = text(raw.title);
  const version = Number(raw.version);
  if (!doi || !title || !Number.isInteger(version) || version < 1) return undefined;
  const authors = (text(raw.authors) ?? '')
    .split(/;\s*/)
    .map((author) => author.trim())
    .filter((author) => author !== '');
  const optional = {
    correspondingAuthor: text(raw.author_corresponding),
    correspondingInstitution: text(raw.author_corresponding_institution),
    date: text(raw.date),
    type: text(raw.type),
    license: text(raw.license),
    category: text(raw.category),
    published: text(raw.published)?.toLowerCase(),
  };
  return {
    doi,
    title: decodeGreek(title),
    authors,
    version,
    server: serverOf(raw.server, server),
    abstract: decodeGreek(text(raw.abstract) ?? ''),
    ...(Object.fromEntries(
      Object.entries(optional).filter(([, entry]) => entry !== undefined),
    ) as Partial<BiorxivRecord>),
  };
}

/**
 * Parses a details response (`/details/<server>/<doi>` or
 * `/details/<server>/<from>/<to>/<cursor>`). Records that lack a DOI, title
 * or version are skipped.
 */
export function parseBiorxivDetails(body: string, server: BiorxivServer): BiorxivDetailsPage {
  const root = parseJson(body, 'details');
  const message = firstMessage(root);
  const collection = Array.isArray(root.collection) ? root.collection : [];
  const total = Number(message.total);
  return {
    status: typeof message.status === 'string' ? message.status : 'ok',
    ...(typeof message.category === 'string' ? { category: message.category.toLowerCase() } : {}),
    ...(Number.isInteger(total) && total >= 0 ? { total } : {}),
    records: collection
      .map((record) => parseRecord(record, server))
      .filter((record): record is BiorxivRecord => record !== undefined),
  };
}

/** The journal a preprint was published in, from a `/pubs/<server>/<doi>` response. */
export function parseBiorxivPublication(
  body: string,
): { journal?: string; publishedDate?: string } | undefined {
  const root = parseJson(body, 'publication');
  const first = Array.isArray(root.collection) ? root.collection[0] : undefined;
  if (typeof first !== 'object' || first === null) return undefined;
  const raw = first as Record<string, unknown>;
  const journal = text(raw.published_journal);
  const publishedDate = text(raw.published_date);
  if (!journal && !publishedDate) return undefined;
  return { ...(journal ? { journal } : {}), ...(publishedDate ? { publishedDate } : {}) };
}

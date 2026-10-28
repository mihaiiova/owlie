import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ContentCollection,
  ContentItem,
  ContentLocator,
  DeferredResponseItemAdapter,
  ExtractionOptions,
  ExtractionWarning,
  HttpFetcher,
  HttpFetchPolicy,
  HttpTextResponse,
  ItemAdapter,
  NormalizedDocument,
} from '@owlieio/core';
import {
  assertBoundedLimit,
  buildProvenance,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  extractionFetchedAt,
  isHtmlContentType,
  isJsonContentType,
  RequestGate,
} from '@owlieio/core';
import {
  parseBiorxivDetails,
  parseBiorxivPublication,
  type BiorxivDetailsPage,
  type BiorxivRecord,
} from './biorxiv-api.js';
import {
  biorxivCollectionUrl,
  biorxivContentUrl,
  isBiorxivCollectionPath,
  parseBiorxivCollectionUrl,
  parseBiorxivPaperUrl,
  type BiorxivCollectionRef,
} from './biorxiv-url.js';
import { prepareBiorxivHtml } from './fulltext.js';
import {
  BIORXIV_SERVERS,
  echoedCategory,
  findSubject,
  serverTitle,
  type BiorxivServer,
} from './subjects.js';

/** Warning when a preprint's full text could not be read and only the abstract is returned. */
export const BIORXIV_ABSTRACT_ONLY = 'BIORXIV_ABSTRACT_ONLY';
/** Warning when a preprint has been withdrawn (its text is the metadata and abstract). */
export const BIORXIV_WITHDRAWN = 'BIORXIV_WITHDRAWN';

/** The most preprints one `list` call may return (same bound as arXiv). */
export const MAX_BIORXIV_LIST_LIMIT = 200;
/** How many days back a listing reaches. */
export const BIORXIV_LISTING_DAYS = 14;
/** Spacing between `api.biorxiv.org` requests. */
export const BIORXIV_API_INTERVAL_MS = 1_000;
/** Spacing between page and PDF requests to `biorxiv.org` / `medrxiv.org`. */
export const BIORXIV_PAGE_INTERVAL_MS = 2_000;

/** The details endpoint returns this many records per page. */
const API_PAGE_SIZE = 30;
/** Below this many characters a full-text page is treated as having no body. */
const MIN_BODY_CHARS = 1_500;
/** The longest `Retry-After` honored before failing. */
const MAX_RETRY_AFTER_MS = 30_000;
/** The wait after a 429 that carries no `Retry-After`. */
const DEFAULT_RETRY_AFTER_MS = 5_000;
const DAY_MS = 86_400_000;

const API_URL = 'https://api.biorxiv.org';

/** One gate per process for the API, and one for the two sites' pages. */
export const sharedBiorxivApiGate = new RequestGate(BIORXIV_API_INTERVAL_MS);
export const sharedBiorxivPageGate = new RequestGate(BIORXIV_PAGE_INTERVAL_MS);

/** Where a preprint's body text came from. */
export type BiorxivTextSource = 'html' | 'pdf' | 'abstract';

interface BiorxivNetworkOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
  /** Spaces API requests; defaults to one shared one-second gate per process. */
  apiGate?: RequestGate;
  /** Spaces page and PDF requests; defaults to one shared two-second gate per process. */
  pageGate?: RequestGate;
}

export interface BiorxivPaperAdapterOptions extends BiorxivNetworkOptions {
  /**
   * Reads a preprint's full-text page and PDF: the article adapter, composed
   * by the CLI because adapters do not depend on each other. Without it,
   * preprints are read as their abstract.
   */
  article?: ItemAdapter & DeferredResponseItemAdapter;
  /** Return the metadata and abstract only, without reading the preprint. */
  abstractOnly?: boolean;
}

export interface BiorxivCollectionAdapterOptions extends BiorxivNetworkOptions {
  /** Keep revisions (versions after the first) of older preprints. */
  includeReplacements?: boolean;
  /** Clock for the listing window (tests). */
  now?: () => number;
}

function isRateLimited(error: unknown): error is ExtractionError {
  return error instanceof ExtractionError && error.details?.httpStatus === 429;
}

class BiorxivNetwork {
  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;
  private readonly apiGate: RequestGate;
  private readonly pageGate: RequestGate;

  constructor(options: BiorxivNetworkOptions) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
    this.apiGate = options.apiGate ?? sharedBiorxivApiGate;
    this.pageGate = options.pageGate ?? sharedBiorxivPageGate;
  }

  /**
   * Runs `task` through `gate`. On HTTP 429 it waits for the server's
   * `Retry-After` (capped at thirty seconds) and tries once more.
   */
  private async paced<T>(
    gate: RequestGate,
    task: () => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    try {
      return await gate.run(task, signal);
    } catch (error) {
      if (!isRateLimited(error)) throw error;
      const seconds = error.details?.retryAfterSeconds;
      const waitMs =
        typeof seconds === 'number'
          ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
          : DEFAULT_RETRY_AFTER_MS;
      await gate.pause(waitMs, signal);
      try {
        return await gate.run(task, signal);
      } catch (retryError) {
        if (!isRateLimited(retryError)) throw retryError;
        throw new ExtractionError('bioRxiv/medRxiv is rate limiting requests (HTTP 429)', {
          cause: retryError,
          details: { httpStatus: 429 },
        });
      }
    }
  }

  /** A JSON body from `api.biorxiv.org`, content type checked. */
  async api(path: string, signal: AbortSignal | undefined): Promise<string> {
    const response = await this.paced(
      this.apiGate,
      () => this.fetcher.fetch(`${API_URL}${path}`, { signal, policy: this.policy }),
      signal,
    );
    if (!isJsonContentType(response.contentType)) {
      throw new ExtractionError(
        `bioRxiv API returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    return response.text;
  }

  /** A page from `biorxiv.org` / `medrxiv.org`. */
  page(url: string, signal: AbortSignal | undefined): Promise<HttpTextResponse> {
    return this.paced(
      this.pageGate,
      () => this.fetcher.fetch(url, { signal, policy: this.policy }),
      signal,
    );
  }

  /** Any other request to the sites (the PDF, read by the article adapter). */
  sitePaced<T>(task: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
    return this.paced(this.pageGate, task, signal);
  }
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

/** Listing and item metadata shared by `list` and `extract`. */
function recordMetadata(record: BiorxivRecord): Record<string, unknown> {
  return compact({
    doi: record.doi,
    server: record.server,
    version: record.version,
    authors: record.authors,
    category: record.category,
    articleType: record.type,
    license: record.license,
    published: record.published,
  });
}

function recordItem(record: BiorxivRecord): ContentItem {
  return {
    id: `biorxiv:${record.doi}`,
    sourceType: 'biorxiv',
    canonicalUrl: biorxivContentUrl(record.server, record.doi),
    title: record.title,
    ...(record.abstract ? { description: record.abstract } : {}),
    ...(record.date ? { publishedAt: record.date } : {}),
    ...(record.authors.length > 0 ? { author: record.authors.join(', ') } : {}),
    metadata: recordMetadata(record),
  };
}

function isWithdrawn(record: BiorxivRecord): boolean {
  return (
    /^withdrawn\b/i.test(record.title) ||
    /\bwithdrawn\b/i.test(record.type ?? '') ||
    /\b(?:has been|was|is being|are) withdrawn\b|\bwithdraw(?:n|ing) (?:this|the) (?:manuscript|preprint)\b/i.test(
      record.abstract,
    )
  );
}

interface PaperRef {
  doi: string;
  server: BiorxivServer;
  version?: number;
}

function refFromItem(item: ContentItem): PaperRef {
  const doi = item.metadata.doi;
  const server = item.metadata.server;
  if (typeof doi === 'string' && (server === 'biorxiv' || server === 'medrxiv')) {
    const version = item.metadata.requestedVersion;
    return typeof version === 'number' ? { doi, server, version } : { doi, server };
  }
  const ref = parseBiorxivPaperUrl(item.canonicalUrl);
  if (!ref) throw new ConfigurationError(`not a bioRxiv/medRxiv preprint: ${item.canonicalUrl}`);
  return ref;
}

/**
 * A single bioRxiv or medRxiv preprint (ADR 0041). Metadata comes from
 * `api.biorxiv.org`; the body from the full-text page, else the PDF, else
 * the abstract alone. Identity is version-less (`biorxiv:<doi>`).
 */
export class BiorxivPaperAdapter implements ItemAdapter {
  static readonly id = 'biorxiv';
  readonly id = BiorxivPaperAdapter.id;
  readonly sourceType = 'biorxiv' as const;

  private readonly network: BiorxivNetwork;
  private readonly article: (ItemAdapter & DeferredResponseItemAdapter) | undefined;
  private readonly abstractOnly: boolean;

  constructor(options: BiorxivPaperAdapterOptions = {}) {
    this.network = new BiorxivNetwork(options);
    this.article = options.article;
    this.abstractOnly = options.abstractOnly ?? false;
  }

  recognize(locator: ContentLocator): boolean {
    return parseBiorxivPaperUrl(locator.url) !== undefined;
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    const ref = parseBiorxivPaperUrl(locator.url);
    if (!ref) {
      throw new ConfigurationError(`not a recognized bioRxiv/medRxiv preprint URL: ${locator.url}`);
    }
    return {
      id: `biorxiv:${ref.doi}`,
      sourceType: 'biorxiv',
      canonicalUrl: biorxivContentUrl(ref.server, ref.doi),
      metadata: {
        doi: ref.doi,
        server: ref.server,
        ...(ref.version === undefined ? {} : { requestedVersion: ref.version }),
      },
    };
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    const target = item.id;
    options.progress?.emit({ type: 'started', target });
    try {
      const document = await this.read(refFromItem(item), options);
      options.progress?.emit({ type: 'completed', target, result: document });
      return document;
    } catch (error) {
      if (error instanceof CancelledError) options.progress?.emit({ type: 'cancelled', target });
      else {
        const message = error instanceof Error ? error.message : String(error);
        options.progress?.emit({ type: 'failed', target, error: message });
      }
      throw error;
    }
  }

  /** Every version of a preprint, from the URL's server first, then the other one. */
  private async versions(ref: PaperRef, signal: AbortSignal | undefined) {
    const servers = [ref.server, ...BIORXIV_SERVERS.filter((server) => server !== ref.server)];
    for (const server of servers) {
      const page = parseBiorxivDetails(
        await this.network.api(`/details/${server}/${ref.doi}`, signal),
        server,
      );
      const records = page.records.filter((record) => record.doi === ref.doi);
      if (records.length > 0) return records.sort((a, b) => a.version - b.version);
    }
    throw new ExtractionError(`bioRxiv/medRxiv preprint ${ref.doi} not found`);
  }

  private async read(ref: PaperRef, options: ExtractionOptions): Promise<NormalizedDocument> {
    const versions = await this.versions(ref, options.signal);
    const latest = versions[versions.length - 1]!;
    const record =
      ref.version === undefined
        ? latest
        : versions.find((candidate) => candidate.version === ref.version);
    if (!record) {
      throw new ExtractionError(
        `bioRxiv/medRxiv preprint ${ref.doi} has no version ${ref.version}`,
      );
    }
    const server = record.server;
    const versionedUrl = biorxivContentUrl(server, record.doi, record.version);
    const publication = record.published
      ? await this.publication(server, record.doi, options.signal)
      : undefined;

    const warnings: ExtractionWarning[] = [];
    let body: { text: string; source: BiorxivTextSource; pageCount?: unknown } | undefined;
    if (isWithdrawn(record)) {
      warnings.push({ code: BIORXIV_WITHDRAWN, message: 'this preprint has been withdrawn' });
    } else if (!this.abstractOnly) {
      body =
        (await this.readHtml(`${versionedUrl}.full`, record.title, options)) ??
        (await this.readPdf(`${versionedUrl}.full.pdf`, options, warnings));
      if (!body) {
        warnings.push({
          code: BIORXIV_ABSTRACT_ONLY,
          message: 'the preprint could not be read; returning its abstract',
        });
      }
    }

    const header = [
      record.title,
      record.authors.join(', '),
      record.abstract ? `Abstract\n\n${record.abstract}` : undefined,
    ].filter((part): part is string => Boolean(part));
    const text = [...header, ...(body ? [body.text] : [])].join('\n\n');
    const canonicalUrl = biorxivContentUrl(server, record.doi);
    const posted = versions[0]!.date;
    return {
      schemaVersion: 2,
      id: `biorxiv:${record.doi}`,
      sourceType: 'biorxiv',
      canonicalUrl,
      mediaType: 'text',
      title: record.title,
      text,
      ...(posted ? { publishedAt: posted } : {}),
      ...(record.authors.length > 0 ? { author: record.authors.join(', ') } : {}),
      metadata: compact({
        ...recordMetadata(record),
        abstract: record.abstract || undefined,
        correspondingAuthor: record.correspondingAuthor,
        correspondingInstitution: record.correspondingInstitution,
        posted,
        versionDate: record.date,
        latestVersion: latest.version,
        versionedUrl,
        htmlUrl: `${versionedUrl}.full`,
        pdfUrl: `${versionedUrl}.full.pdf`,
        journal: publication?.journal,
        journalPublishedDate: publication?.publishedDate,
        textSource: body?.source ?? 'abstract',
        ...(body?.pageCount !== undefined ? { pageCount: body.pageCount } : {}),
      }),
      provenance: buildProvenance({
        sourceId: `biorxiv:${record.doi}`,
        canonicalUrl,
        adapterId: BiorxivPaperAdapter.id,
        text,
        fetchedAt: extractionFetchedAt(options),
        warnings,
      }),
    };
  }

  /** The journal of a published preprint; best effort, since it is only metadata. */
  private async publication(
    server: BiorxivServer,
    doi: string,
    signal: AbortSignal | undefined,
  ): Promise<{ journal?: string; publishedDate?: string } | undefined> {
    try {
      return parseBiorxivPublication(await this.network.api(`/pubs/${server}/${doi}`, signal));
    } catch (error) {
      if (error instanceof CancelledError || signal?.aborted) throw error;
      return undefined;
    }
  }

  /** The full-text page's body, or `undefined` when it has none or cannot be read. */
  private async readHtml(
    url: string,
    title: string,
    options: ExtractionOptions,
  ): Promise<{ text: string; source: 'html' } | undefined> {
    if (!this.article?.resolveItem) return undefined;
    try {
      const response = await this.network.page(url, options.signal);
      if (!isHtmlContentType(response.contentType)) return undefined;
      const prepared = prepareBiorxivHtml(response.text, title);
      if (prepared === undefined) return undefined;
      const item = await this.article.resolveItem({ url: response.url });
      const document = await this.article.extractDeferred(
        item,
        { ...response, text: prepared },
        { signal: options.signal, fetchedAt: options.fetchedAt },
      );
      return document.text.length >= MIN_BODY_CHARS
        ? { text: document.text, source: 'html' }
        : undefined;
    } catch (error) {
      if (error instanceof CancelledError || options.signal?.aborted) throw error;
      return undefined;
    }
  }

  /** The PDF, read by the article adapter, or `undefined` when it cannot be read. */
  private async readPdf(
    url: string,
    options: ExtractionOptions,
    warnings: ExtractionWarning[],
  ): Promise<{ text: string; source: 'pdf'; pageCount?: unknown } | undefined> {
    const article = this.article;
    if (!article?.resolveItem) return undefined;
    try {
      const item = await article.resolveItem({ url });
      const document = await this.network.sitePaced(
        () => article.extract(item, { signal: options.signal, fetchedAt: options.fetchedAt }),
        options.signal,
      );
      if (document.metadata.format !== 'pdf') return undefined;
      warnings.push(...document.provenance.warnings);
      return { text: document.text, source: 'pdf', pageCount: document.metadata.pageCount };
    } catch (error) {
      if (error instanceof CancelledError || options.signal?.aborted) throw error;
      return undefined;
    }
  }
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function collectionRef(collection: ContentCollection): BiorxivCollectionRef {
  const server = collection.metadata.server;
  if (server !== 'biorxiv' && server !== 'medrxiv') {
    throw new ConfigurationError(`not a bioRxiv/medRxiv collection: ${collection.canonicalUrl}`);
  }
  if (collection.metadata.kind === 'server') return { kind: 'server', server };
  const subject = findSubject(server, String(collection.metadata.subject));
  if (!subject) {
    throw new ConfigurationError(`unknown ${serverTitle(server)} subject in ${collection.id}`);
  }
  return { kind: 'subject', subject };
}

/**
 * bioRxiv and medRxiv collections (ADR 0041): a subject's new preprints, or a
 * whole server's, over the last {@link BIORXIV_LISTING_DAYS} days, newest
 * first. The API only takes date ranges and returns them oldest first, thirty
 * per page, so a listing reads the window's pages from the last one back.
 * Revisions are skipped by default; identities are version-less.
 */
export class BiorxivCollectionAdapter implements CollectionAdapter {
  static readonly id = 'biorxiv';
  readonly id = BiorxivCollectionAdapter.id;
  readonly sourceType = 'biorxiv' as const;

  private readonly network: BiorxivNetwork;
  private readonly includeReplacements: boolean;
  private readonly now: () => number;

  constructor(options: BiorxivCollectionAdapterOptions = {}) {
    this.network = new BiorxivNetwork(options);
    this.includeReplacements = options.includeReplacements ?? false;
    this.now = options.now ?? Date.now;
  }

  /** Any collection path on the two sites; an unknown subject fails in {@link resolve}. */
  recognize(locator: ContentLocator): boolean {
    return isBiorxivCollectionPath(locator.url);
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    const ref = parseBiorxivCollectionUrl(locator.url);
    if (!ref) {
      throw new ConfigurationError(
        isBiorxivCollectionPath(locator.url)
          ? `unknown bioRxiv/medRxiv subject: ${locator.url}`
          : `not a recognized bioRxiv/medRxiv collection URL: ${locator.url}`,
      );
    }
    const canonicalUrl = biorxivCollectionUrl(ref);
    if (ref.kind === 'server') {
      return {
        id: `biorxiv:collection:${ref.server}`,
        sourceType: 'biorxiv',
        canonicalUrl,
        title: serverTitle(ref.server),
        metadata: { kind: 'server', server: ref.server },
      };
    }
    const { subject } = ref;
    return {
      id: `biorxiv:collection:${subject.server}:${subject.slug}`,
      sourceType: 'biorxiv',
      canonicalUrl,
      title: `${serverTitle(subject.server)} · ${subject.title}`,
      metadata: {
        kind: 'subject',
        server: subject.server,
        subject: subject.slug,
        category: echoedCategory(subject),
      },
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    const limit = assertBoundedLimit(options.limit, { max: MAX_BIORXIV_LIST_LIMIT });
    const ref = collectionRef(collection);
    const server = ref.kind === 'subject' ? ref.subject.server : ref.server;
    const today = this.now();
    const from = isoDay(today - (BIORXIV_LISTING_DAYS - 1) * DAY_MS);
    const to = isoDay(today);
    const query = ref.kind === 'subject' ? `?category=${ref.subject.apiName}` : '';
    const fetchPage = async (cursor: number): Promise<BiorxivDetailsPage> => {
      const page = parseBiorxivDetails(
        await this.network.api(
          `/details/${server}/${from}/${to}/${cursor}${query}`,
          options.signal,
        ),
        server,
      );
      // The API answers an unknown category with every category instead of an error.
      if (
        ref.kind === 'subject' &&
        page.status === 'ok' &&
        page.category !== echoedCategory(ref.subject)
      ) {
        throw new ExtractionError(
          `bioRxiv API did not apply the subject "${ref.subject.slug}" (got "${page.category ?? 'none'}")`,
        );
      }
      return page;
    };

    const first = await fetchPage(0);
    const total = first.total ?? first.records.length;
    const lastCursor = Math.max(0, Math.floor((total - 1) / API_PAGE_SIZE) * API_PAGE_SIZE);

    const seen = new Set<string>();
    const items: ContentItem[] = [];
    let truncated = false;
    for (let cursor = lastCursor; cursor >= 0; cursor -= API_PAGE_SIZE) {
      const page = cursor === 0 ? first : await fetchPage(cursor);
      for (const record of [...page.records].reverse()) {
        // A skipped revision must not hide the first version further back.
        if (seen.has(record.doi)) continue;
        if (record.version > 1 && !this.includeReplacements) continue;
        seen.add(record.doi);
        if (items.length === limit) {
          truncated = true;
          break;
        }
        items.push(recordItem(record));
      }
      if (truncated) break;
    }
    return {
      collection: {
        ...collection,
        metadata: {
          ...collection.metadata,
          from,
          to,
          ...(first.total === undefined ? {} : { total }),
        },
      },
      items,
      truncated,
    };
  }
}

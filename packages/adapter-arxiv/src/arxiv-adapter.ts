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
  isFeedContentType,
  isHtmlContentType,
} from '@owlieio/core';
import { parseArxivApiFeed, parseArxivRss, type ArxivPaper } from './arxiv-feed.js';
import {
  arxivAbsUrl,
  parseArxivCollectionUrl,
  parseArxivPaperUrl,
  type ArxivPaperRef,
} from './arxiv-url.js';
import { RequestGate, sharedArxivApiGate } from './gate.js';
import { isLatexmlRender, prepareLatexmlHtml } from './latexml.js';

/** Warning when a paper's full text could not be read and only the abstract is returned. */
export const ARXIV_ABSTRACT_ONLY = 'ARXIV_ABSTRACT_ONLY';
/** Warning when a paper has been withdrawn (its text is the withdrawal notice). */
export const ARXIV_WITHDRAWN = 'ARXIV_WITHDRAWN';

/** The most papers one `list` call may return (arXiv asks for no bulk harvesting). */
export const MAX_ARXIV_LIST_LIMIT = 200;

/** Below this many characters an HTML render is treated as unusable. */
const MIN_HTML_BODY_CHARS = 1_000;

const API_URL = 'https://export.arxiv.org/api/query';

/** Where a paper's body text came from. */
export type ArxivTextSource = 'html' | 'pdf' | 'abstract';

interface ArxivNetworkOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
  /** Spaces arXiv API requests; defaults to one shared three-second gate per process. */
  apiGate?: RequestGate;
}

export interface ArxivPaperAdapterOptions extends ArxivNetworkOptions {
  /**
   * Reads a paper's HTML render and PDF: the article adapter, composed by the
   * CLI because adapters do not depend on each other. Without it, papers are
   * read as their abstract.
   */
  article?: ItemAdapter & DeferredResponseItemAdapter;
  /** Return the metadata and abstract only, without reading the paper. */
  abstractOnly?: boolean;
}

export interface ArxivCollectionAdapterOptions extends ArxivNetworkOptions {
  /** Keep `replace` / `replace-cross` announcements (new versions of older papers). */
  includeReplacements?: boolean;
}

class ArxivApi {
  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;
  private readonly gate: RequestGate;

  constructor(options: ArxivNetworkOptions) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
    this.gate = options.apiGate ?? sharedArxivApiGate;
  }

  async query(
    params: Record<string, string>,
    signal: AbortSignal | undefined,
  ): Promise<ReturnType<typeof parseArxivApiFeed>> {
    const url = `${API_URL}?${new URLSearchParams(params).toString()}`;
    const response = await this.gate.run(
      () => this.fetcher.fetch(url, { signal, policy: this.policy }),
      signal,
    );
    if (!isFeedContentType(response.contentType)) {
      throw new ExtractionError(
        `arXiv API returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    return parseArxivApiFeed(response.text);
  }

  async fetch(url: string, signal: AbortSignal | undefined) {
    return this.fetcher.fetch(url, { signal, policy: this.policy });
  }
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

/** Listing and item metadata shared by `list` and `extract`. */
function paperMetadata(paper: ArxivPaper): Record<string, unknown> {
  return compact({
    arxivId: paper.id,
    version: paper.version,
    authors: paper.authors,
    primaryCategory: paper.primaryCategory,
    categories: paper.categories,
    doi: paper.doi,
    journalRef: paper.journalRef,
    license: paper.license,
  });
}

function paperItem(paper: ArxivPaper, extra: Record<string, unknown> = {}): ContentItem {
  return {
    id: `arxiv:${paper.id}`,
    sourceType: 'arxiv',
    canonicalUrl: arxivAbsUrl(paper.id),
    title: paper.title,
    ...(paper.abstract ? { description: paper.abstract } : {}),
    ...(paper.published ? { publishedAt: paper.published } : {}),
    ...(paper.authors.length > 0 ? { author: paper.authors.join(', ') } : {}),
    metadata: { ...paperMetadata(paper), ...extra },
  };
}

function isWithdrawn(paper: ArxivPaper): boolean {
  return /\bwithdrawn\b/i.test(paper.comment ?? '') || /has been withdrawn/i.test(paper.abstract);
}

function refFromItem(item: ContentItem): ArxivPaperRef {
  const id = item.metadata.arxivId;
  if (typeof id === 'string') {
    const version = item.metadata.requestedVersion;
    return typeof version === 'string' ? { id, version } : { id };
  }
  const ref = parseArxivPaperUrl(item.canonicalUrl);
  if (!ref) throw new ConfigurationError(`not an arXiv paper: ${item.canonicalUrl}`);
  return ref;
}

/**
 * A single arXiv paper (ADR 0040). Metadata comes from the arXiv API; the
 * body from the HTML render (LaTeXML, with formulas kept as LaTeX), else the
 * PDF, else the abstract alone. Identity is version-less (`arxiv:<id>`).
 */
export class ArxivPaperAdapter implements ItemAdapter {
  static readonly id = 'arxiv';
  readonly id = ArxivPaperAdapter.id;
  readonly sourceType = 'arxiv' as const;

  private readonly api: ArxivApi;
  private readonly article: (ItemAdapter & DeferredResponseItemAdapter) | undefined;
  private readonly abstractOnly: boolean;

  constructor(options: ArxivPaperAdapterOptions = {}) {
    this.api = new ArxivApi(options);
    this.article = options.article;
    this.abstractOnly = options.abstractOnly ?? false;
  }

  recognize(locator: ContentLocator): boolean {
    return parseArxivPaperUrl(locator.url) !== undefined;
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    const ref = parseArxivPaperUrl(locator.url);
    if (!ref) throw new ConfigurationError(`not a recognized arXiv paper URL: ${locator.url}`);
    return {
      id: `arxiv:${ref.id}`,
      sourceType: 'arxiv',
      canonicalUrl: arxivAbsUrl(ref.id),
      metadata: { arxivId: ref.id, ...(ref.version ? { requestedVersion: ref.version } : {}) },
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

  private async read(ref: ArxivPaperRef, options: ExtractionOptions): Promise<NormalizedDocument> {
    const { papers } = await this.api.query(
      { id_list: `${ref.id}${ref.version ?? ''}` },
      options.signal,
    );
    const paper = papers.find((candidate) => candidate.id === ref.id);
    if (!paper) throw new ExtractionError(`arXiv paper ${ref.id} not found`);

    const warnings: ExtractionWarning[] = [];
    let body: { text: string; source: ArxivTextSource; pageCount?: unknown } | undefined;
    if (isWithdrawn(paper)) {
      warnings.push({ code: ARXIV_WITHDRAWN, message: 'this paper has been withdrawn' });
    } else if (!this.abstractOnly) {
      // An explicit version reads that version; otherwise the latest.
      const versioned = `${ref.id}${ref.version ?? ''}`;
      body =
        (await this.readHtml(versioned, options)) ??
        (await this.readPdf(versioned, options, warnings));
      if (!body) {
        warnings.push({
          code: ARXIV_ABSTRACT_ONLY,
          message: 'the paper could not be read; returning its abstract',
        });
      }
    }

    const header = [
      paper.title,
      paper.authors.join(', '),
      paper.abstract ? `Abstract\n\n${paper.abstract}` : undefined,
    ].filter((part): part is string => Boolean(part));
    const text = [...header, ...(body ? [body.text] : [])].join('\n\n');
    const canonicalUrl = arxivAbsUrl(paper.id);
    const version = ref.version ?? paper.version;
    const versionedId = `${paper.id}${version ?? ''}`;
    return {
      schemaVersion: 2,
      id: `arxiv:${paper.id}`,
      sourceType: 'arxiv',
      canonicalUrl,
      mediaType: 'text',
      title: paper.title,
      text,
      ...(paper.published ? { publishedAt: paper.published } : {}),
      ...(paper.authors.length > 0 ? { author: paper.authors.join(', ') } : {}),
      metadata: compact({
        ...paperMetadata(paper),
        version,
        versionedId,
        abstract: paper.abstract,
        published: paper.published,
        updated: paper.updated,
        comment: paper.comment,
        absUrl: arxivAbsUrl(paper.id, version),
        pdfUrl: `https://arxiv.org/pdf/${versionedId}`,
        textSource: body?.source ?? 'abstract',
        ...(body?.pageCount !== undefined ? { pageCount: body.pageCount } : {}),
      }),
      provenance: buildProvenance({
        sourceId: `arxiv:${paper.id}`,
        canonicalUrl,
        adapterId: ArxivPaperAdapter.id,
        text,
        fetchedAt: extractionFetchedAt(options),
        warnings,
      }),
    };
  }

  /** The LaTeXML render, or `undefined` when it is missing, failed, or too short. */
  private async readHtml(
    versionedId: string,
    options: ExtractionOptions,
  ): Promise<{ text: string; source: 'html' } | undefined> {
    if (!this.article?.resolveItem) return undefined;
    try {
      const response = await this.api.fetch(
        `https://arxiv.org/html/${versionedId}`,
        options.signal,
      );
      if (!isHtmlContentType(response.contentType) || !isLatexmlRender(response.text)) {
        return undefined;
      }
      const item = await this.article.resolveItem({ url: response.url });
      const document = await this.article.extractDeferred(
        item,
        { ...response, text: prepareLatexmlHtml(response.text) },
        { signal: options.signal, fetchedAt: options.fetchedAt },
      );
      return document.text.length >= MIN_HTML_BODY_CHARS
        ? { text: document.text, source: 'html' }
        : undefined;
    } catch (error) {
      if (error instanceof CancelledError || options.signal?.aborted) throw error;
      return undefined;
    }
  }

  /** The PDF, read by the article adapter, or `undefined` when it cannot be read. */
  private async readPdf(
    versionedId: string,
    options: ExtractionOptions,
    warnings: ExtractionWarning[],
  ): Promise<{ text: string; source: 'pdf'; pageCount?: unknown } | undefined> {
    if (!this.article?.resolveItem) return undefined;
    try {
      const item = await this.article.resolveItem({ url: `https://arxiv.org/pdf/${versionedId}` });
      const document = await this.article.extract(item, {
        signal: options.signal,
        fetchedAt: options.fetchedAt,
      });
      if (document.metadata.format !== 'pdf') return undefined;
      warnings.push(...document.provenance.warnings);
      return { text: document.text, source: 'pdf', pageCount: document.metadata.pageCount };
    } catch (error) {
      if (error instanceof CancelledError || options.signal?.aborted) throw error;
      return undefined;
    }
  }
}

/**
 * arXiv collections (ADR 0040): a category's daily announcements, read from
 * `rss.arxiv.org/rss/<cat>[+<cat>…]` (replacements skipped by default), and
 * API search queries, newest submissions first. Listings are bounded by
 * {@link MAX_ARXIV_LIST_LIMIT}.
 */
export class ArxivCollectionAdapter implements CollectionAdapter {
  static readonly id = 'arxiv';
  readonly id = ArxivCollectionAdapter.id;
  readonly sourceType = 'arxiv' as const;

  private readonly api: ArxivApi;
  private readonly includeReplacements: boolean;

  constructor(options: ArxivCollectionAdapterOptions = {}) {
    this.api = new ArxivApi(options);
    this.includeReplacements = options.includeReplacements ?? false;
  }

  recognize(locator: ContentLocator): boolean {
    return parseArxivCollectionUrl(locator.url) !== undefined;
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    const ref = parseArxivCollectionUrl(locator.url);
    if (!ref) throw new ConfigurationError(`not a recognized arXiv collection URL: ${locator.url}`);
    if (ref.kind === 'category') {
      const categories = ref.categories.join('+');
      return {
        id: `arxiv:list:${categories}`,
        sourceType: 'arxiv',
        canonicalUrl: `https://rss.arxiv.org/rss/${categories}`,
        metadata: { kind: 'category', categories: ref.categories },
      };
    }
    return {
      id: `arxiv:query:${ref.query}`,
      sourceType: 'arxiv',
      canonicalUrl: `${API_URL}?${new URLSearchParams({ search_query: ref.query }).toString()}`,
      metadata: { kind: 'query', query: ref.query },
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    const limit = assertBoundedLimit(options.limit, { max: MAX_ARXIV_LIST_LIMIT });
    if (collection.metadata.kind === 'query') {
      const { papers, totalResults } = await this.api.query(
        {
          search_query: String(collection.metadata.query),
          sortBy: 'submittedDate',
          sortOrder: 'descending',
          start: '0',
          max_results: String(limit),
        },
        options.signal,
      );
      const items = papers.slice(0, limit).map((paper) => paperItem(paper));
      return {
        collection: { ...collection, metadata: compact({ ...collection.metadata, totalResults }) },
        items,
        truncated: (totalResults ?? papers.length) > items.length,
      };
    }

    const response = await this.api.fetch(collection.canonicalUrl, options.signal);
    if (!isFeedContentType(response.contentType)) {
      throw new ExtractionError(
        `arXiv feed returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    const feed = parseArxivRss(response.text);
    const entries = this.includeReplacements
      ? feed.entries
      : feed.entries.filter((entry) => !entry.announceType.startsWith('replace'));
    return {
      collection: { ...collection, ...(feed.title ? { title: feed.title } : {}) },
      items: entries
        .slice(0, limit)
        .map((entry) => paperItem(entry, { announceType: entry.announceType })),
      truncated: entries.length > limit,
    };
  }
}

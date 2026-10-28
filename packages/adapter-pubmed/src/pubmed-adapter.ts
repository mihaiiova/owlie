import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ContentCollection,
  ContentItem,
  ContentLocator,
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
  isJsonContentType,
  RequestGate,
} from '@owlieio/core';
import { parsePmcArticle, type JatsArticle } from './jats.js';
import {
  abstractText,
  isRetracted,
  parseIdConversion,
  parsePubmedArticles,
  parsePubmedSearch,
  parsePubmedSummaries,
  type PubmedRecord,
  type PubmedSummary,
} from './pubmed-xml.js';
import {
  parsePubmedArticleUrl,
  parsePubmedSearchUrl,
  pmcArticleUrl,
  pubmedArticleUrl,
  pubmedSearchKey,
  pubmedSearchUrl,
  type PubmedArticleRef,
} from './pubmed-url.js';

/** Warning when an article has no open PMC full text and only the abstract is returned. */
export const PUBMED_ABSTRACT_ONLY = 'PUBMED_ABSTRACT_ONLY';
/** Warning when an article is marked as a retracted publication. */
export const PUBMED_RETRACTED = 'PUBMED_RETRACTED';
/** Warning when no contact email is configured (NCBI asks for one). */
export const PUBMED_NO_CONTACT = 'PUBMED_NO_CONTACT';
/** Warning when a search URL's `filter=` values could not all be translated. */
export const PUBMED_FILTER_IGNORED = 'PUBMED_FILTER_IGNORED';

/** The most articles one `list` call may return (same bound as arXiv). */
export const MAX_PUBMED_LIST_LIMIT = 200;
/** NCBI's limit without an API key: three requests a second. */
export const PUBMED_INTERVAL_MS = 334;
/** NCBI's limit with an API key: ten requests a second. */
export const PUBMED_KEY_INTERVAL_MS = 100;

/** Below this many characters a PMC body is treated as missing. */
const MIN_BODY_CHARS = 1_000;

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const IDCONV = 'https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/';
const TOOL = 'owlie';

/** One gate per process for each NCBI rate (with and without an API key). */
export const sharedPubmedGate = new RequestGate(PUBMED_INTERVAL_MS);
export const sharedPubmedKeyGate = new RequestGate(PUBMED_KEY_INTERVAL_MS);

/** Where an article's body text came from. */
export type PubmedTextSource = 'pmc' | 'abstract';

export interface PubmedNetworkOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
  /** Spaces NCBI requests; defaults to one shared gate per process for the configured rate. */
  gate?: RequestGate;
  /** Contact email sent as `email=` on every request, as NCBI's E-utilities policy asks. */
  contactEmail?: string;
  /** Optional NCBI API key (raises the limit from three to ten requests a second). */
  apiKey?: string;
}

export interface PubmedArticleAdapterOptions extends PubmedNetworkOptions {
  /** Return the metadata and abstract only, without reading PMC. */
  abstractOnly?: boolean;
}

class Eutils {
  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;
  private readonly gate: RequestGate;
  readonly contactEmail: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(options: PubmedNetworkOptions) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
    this.contactEmail = options.contactEmail?.trim() || undefined;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.gate = options.gate ?? (this.apiKey ? sharedPubmedKeyGate : sharedPubmedGate);
  }

  private identify(params: Record<string, string>): string {
    return new URLSearchParams({
      ...params,
      tool: TOOL,
      ...(this.contactEmail ? { email: this.contactEmail } : {}),
      ...(this.apiKey ? { api_key: this.apiKey } : {}),
    }).toString();
  }

  private async get(url: string, signal: AbortSignal | undefined) {
    return this.gate.run(() => this.fetcher.fetch(url, { signal, policy: this.policy }), signal);
  }

  async json(endpoint: string, params: Record<string, string>, signal: AbortSignal | undefined) {
    const response = await this.get(`${EUTILS}/${endpoint}.fcgi?${this.identify(params)}`, signal);
    if (!isJsonContentType(response.contentType)) {
      throw new ExtractionError(
        `NCBI ${endpoint} returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    return response.text;
  }

  async xml(endpoint: string, params: Record<string, string>, signal: AbortSignal | undefined) {
    const response = await this.get(`${EUTILS}/${endpoint}.fcgi?${this.identify(params)}`, signal);
    if (!isFeedContentType(response.contentType)) {
      throw new ExtractionError(
        `NCBI ${endpoint} returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    return response.text;
  }

  async idconv(pmcid: string, signal: AbortSignal | undefined) {
    const response = await this.get(
      `${IDCONV}?${this.identify({ ids: pmcid, format: 'json' })}`,
      signal,
    );
    if (!isJsonContentType(response.contentType)) {
      throw new ExtractionError(
        `PMC ID converter returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    return response.text;
  }
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

function noContactWarning(network: Eutils): ExtractionWarning[] {
  return network.contactEmail
    ? []
    : [
        {
          code: PUBMED_NO_CONTACT,
          message: 'no contact email is set for NCBI (--contact-email or OWLIE_CONTACT_EMAIL)',
        },
      ];
}

function refFromItem(item: ContentItem): PubmedArticleRef {
  const { pmid, pmcid } = item.metadata;
  if (typeof pmid === 'string') return { kind: 'pmid', pmid };
  if (typeof pmcid === 'string') return { kind: 'pmcid', pmcid };
  const ref = parsePubmedArticleUrl(item.canonicalUrl);
  if (!ref) throw new ConfigurationError(`not a PubMed article: ${item.canonicalUrl}`);
  return ref;
}

/** A listing item from an `esummary` record. */
function summaryItem(summary: PubmedSummary): ContentItem {
  return {
    id: `pubmed:${summary.pmid}`,
    sourceType: 'pubmed',
    canonicalUrl: pubmedArticleUrl(summary.pmid),
    title: summary.title,
    ...(summary.publicationDate ? { publishedAt: summary.publicationDate } : {}),
    ...(summary.authors.length > 0 ? { author: summary.authors.join(', ') } : {}),
    metadata: compact({
      pmid: summary.pmid,
      pmcid: summary.pmcid,
      doi: summary.doi,
      authors: nonEmpty(summary.authors),
      journal: summary.journal,
      publicationTypes: nonEmpty(summary.publicationTypes),
    }),
  };
}

interface ArticleText {
  id: string;
  canonicalUrl: string;
  title: string;
  authors: string[];
  journal?: string;
  publicationDate?: string;
  abstract: string;
  body?: string;
  warnings: ExtractionWarning[];
  metadata: Record<string, unknown>;
}

/**
 * A single PubMed article (ADR 0042). Metadata comes from PubMed (E-utilities
 * `efetch`); the body from the open PMC full text (JATS) when there is one,
 * else the abstract alone. A PMC URL resolves to its PMID, so both give the
 * same identity (`pubmed:<pmid>`).
 */
export class PubmedArticleAdapter implements ItemAdapter {
  static readonly id = 'pubmed';
  readonly id = PubmedArticleAdapter.id;
  readonly sourceType = 'pubmed' as const;

  private readonly network: Eutils;
  private readonly abstractOnly: boolean;

  constructor(options: PubmedArticleAdapterOptions = {}) {
    this.network = new Eutils(options);
    this.abstractOnly = options.abstractOnly ?? false;
  }

  recognize(locator: ContentLocator): boolean {
    return parsePubmedArticleUrl(locator.url) !== undefined;
  }

  /** A PubMed URL resolves without network; a PMC URL keeps its PMCID until extraction. */
  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    const ref = parsePubmedArticleUrl(locator.url);
    if (!ref)
      throw new ConfigurationError(`not a recognized PubMed or PMC article URL: ${locator.url}`);
    if (ref.kind === 'pmid') {
      return {
        id: `pubmed:${ref.pmid}`,
        sourceType: 'pubmed',
        canonicalUrl: pubmedArticleUrl(ref.pmid),
        metadata: { pmid: ref.pmid },
      };
    }
    return {
      id: `pubmed:${ref.pmcid}`,
      sourceType: 'pubmed',
      canonicalUrl: pmcArticleUrl(ref.pmcid),
      metadata: { pmcid: ref.pmcid },
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

  private async read(
    ref: PubmedArticleRef,
    options: ExtractionOptions,
  ): Promise<NormalizedDocument> {
    let article: ArticleText;
    if (ref.kind === 'pmid') {
      article = await this.readPmid(ref.pmid, options.signal);
    } else {
      const ids = parseIdConversion(
        await this.network.idconv(ref.pmcid, options.signal),
        ref.pmcid,
      );
      if (!ids) throw new ExtractionError(`PMC article ${ref.pmcid} not found`);
      article = ids.pmid
        ? await this.readPmid(ids.pmid, options.signal)
        : await this.readPmcOnly(ref.pmcid, options.signal);
    }

    const header = [
      article.title,
      article.authors.join(', '),
      [article.journal, article.publicationDate].filter(Boolean).join(', ') || undefined,
      article.abstract ? `Abstract\n\n${article.abstract}` : undefined,
    ].filter((part): part is string => Boolean(part));
    const text = [...header, ...(article.body ? [article.body] : [])].join('\n\n');
    const warnings = [...article.warnings, ...noContactWarning(this.network)];
    return {
      schemaVersion: 2,
      id: article.id,
      sourceType: 'pubmed',
      canonicalUrl: article.canonicalUrl,
      mediaType: 'text',
      title: article.title,
      text,
      ...(article.publicationDate ? { publishedAt: article.publicationDate } : {}),
      ...(article.authors.length > 0 ? { author: article.authors.join(', ') } : {}),
      metadata: compact({
        ...article.metadata,
        abstract: article.abstract || undefined,
        textSource: article.body ? 'pmc' : 'abstract',
      }),
      provenance: buildProvenance({
        sourceId: article.id,
        canonicalUrl: article.canonicalUrl,
        adapterId: PubmedArticleAdapter.id,
        text,
        fetchedAt: extractionFetchedAt(options),
        warnings,
      }),
    };
  }

  /** The PMC body, or `undefined` when PMC withholds it, it is too short, or it cannot be read. */
  private async readPmcBody(
    pmcid: string,
    signal: AbortSignal | undefined,
  ): Promise<JatsArticle | undefined> {
    try {
      return parsePmcArticle(await this.network.xml('efetch', { db: 'pmc', id: pmcid }, signal));
    } catch (error) {
      if (error instanceof CancelledError || signal?.aborted) throw error;
      return undefined;
    }
  }

  private async readPmid(pmid: string, signal: AbortSignal | undefined): Promise<ArticleText> {
    const [record] = parsePubmedArticles(
      await this.network.xml('efetch', { db: 'pubmed', id: pmid, retmode: 'xml' }, signal),
    ).filter((candidate) => candidate.pmid === pmid);
    if (!record) throw new ExtractionError(`PubMed article ${pmid} not found`);

    const warnings: ExtractionWarning[] = [];
    if (isRetracted(record)) {
      warnings.push({ code: PUBMED_RETRACTED, message: 'this article is marked as retracted' });
    }
    let body: string | undefined;
    if (!this.abstractOnly) {
      const pmc = record.pmcid ? await this.readPmcBody(record.pmcid, signal) : undefined;
      body = pmc?.body && pmc.body.length >= MIN_BODY_CHARS ? pmc.body : undefined;
      if (!body) {
        warnings.push({
          code: PUBMED_ABSTRACT_ONLY,
          message: record.pmcid
            ? "PMC does not offer this article's full text; returning its abstract"
            : 'this article has no free full text in PMC; returning its abstract',
        });
      }
    }
    return {
      id: `pubmed:${record.pmid}`,
      canonicalUrl: pubmedArticleUrl(record.pmid),
      title: record.title,
      authors: record.authors,
      ...(record.journal ? { journal: record.journal } : {}),
      ...(record.publicationDate ? { publicationDate: record.publicationDate } : {}),
      abstract: abstractText(record.abstractSections),
      ...(body ? { body } : {}),
      warnings,
      metadata: recordMetadata(record),
    };
  }

  /** A PMC article without a PMID (some preprints and author manuscripts): metadata from its JATS front. */
  private async readPmcOnly(pmcid: string, signal: AbortSignal | undefined): Promise<ArticleText> {
    const pmc = parsePmcArticle(await this.network.xml('efetch', { db: 'pmc', id: pmcid }, signal));
    if (!pmc?.front.title) throw new ExtractionError(`PMC article ${pmcid} not found`);
    const { front } = pmc;
    const body =
      !this.abstractOnly && pmc.body && pmc.body.length >= MIN_BODY_CHARS ? pmc.body : undefined;
    return {
      id: `pubmed:${pmcid}`,
      canonicalUrl: pmcArticleUrl(pmcid),
      title: front.title!,
      authors: front.authors,
      ...(front.journal ? { journal: front.journal } : {}),
      ...(front.publicationDate ? { publicationDate: front.publicationDate } : {}),
      abstract: front.abstract ?? '',
      ...(body ? { body } : {}),
      warnings:
        body || this.abstractOnly
          ? []
          : [
              {
                code: PUBMED_ABSTRACT_ONLY,
                message: "PMC does not offer this article's full text; returning its abstract",
              },
            ],
      metadata: compact({
        pmcid,
        doi: front.doi,
        authors: nonEmpty(front.authors),
        journal: front.journal,
        publicationDate: front.publicationDate,
        pmcUrl: pmcArticleUrl(pmcid),
      }),
    };
  }
}

function recordMetadata(record: PubmedRecord): Record<string, unknown> {
  return compact({
    pmid: record.pmid,
    pmcid: record.pmcid,
    doi: record.doi,
    authors: nonEmpty(record.authors),
    affiliations: nonEmpty(record.affiliations),
    journal: record.journal,
    journalAbbreviation: record.journalAbbreviation,
    volume: record.volume,
    issue: record.issue,
    pages: record.pages,
    publicationDate: record.publicationDate,
    publicationTypes: nonEmpty(record.publicationTypes),
    meshHeadings: nonEmpty(record.meshHeadings),
    keywords: nonEmpty(record.keywords),
    language: record.language,
    retracted: isRetracted(record) || undefined,
    pubmedUrl: pubmedArticleUrl(record.pmid),
    pmcUrl: record.pmcid ? pmcArticleUrl(record.pmcid) : undefined,
  });
}

/**
 * PubMed searches (ADR 0042): the newest articles matching a query, by
 * publication date, bounded by {@link MAX_PUBMED_LIST_LIMIT}. One `esearch`
 * and one `esummary` request per listing.
 */
export class PubmedSearchAdapter implements CollectionAdapter {
  static readonly id = 'pubmed';
  readonly id = PubmedSearchAdapter.id;
  readonly sourceType = 'pubmed' as const;

  private readonly network: Eutils;

  constructor(options: PubmedNetworkOptions = {}) {
    this.network = new Eutils(options);
  }

  recognize(locator: ContentLocator): boolean {
    return parsePubmedSearchUrl(locator.url) !== undefined;
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    const ref = parsePubmedSearchUrl(locator.url);
    if (!ref) throw new ConfigurationError(`not a recognized PubMed search URL: ${locator.url}`);
    return {
      id: `pubmed:search:${pubmedSearchKey(ref.query)}`,
      sourceType: 'pubmed',
      canonicalUrl: pubmedSearchUrl(ref.query),
      title: `PubMed: ${ref.query}`,
      metadata: compact({
        kind: 'search',
        query: ref.query,
        ignoredFilters: nonEmpty(ref.ignoredFilters),
        warnings:
          ref.ignoredFilters.length > 0
            ? [
                {
                  code: PUBMED_FILTER_IGNORED,
                  message: `filters with no query equivalent were ignored: ${ref.ignoredFilters.join(', ')}`,
                },
              ]
            : undefined,
      }),
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    const limit = assertBoundedLimit(options.limit, { max: MAX_PUBMED_LIST_LIMIT });
    const query = collection.metadata.query;
    if (typeof query !== 'string' || query === '') {
      throw new ConfigurationError(`not a PubMed search: ${collection.id}`);
    }
    const search = parsePubmedSearch(
      await this.network.json(
        'esearch',
        { db: 'pubmed', term: query, sort: 'pub_date', retmax: String(limit), retmode: 'json' },
        options.signal,
      ),
    );
    const ids = search.ids.slice(0, limit);
    const items =
      ids.length === 0
        ? []
        : parsePubmedSummaries(
            await this.network.json(
              'esummary',
              { db: 'pubmed', id: ids.join(','), retmode: 'json' },
              options.signal,
            ),
            ids,
          ).map(summaryItem);
    return {
      collection: {
        ...collection,
        metadata: compact({
          ...collection.metadata,
          totalResults: search.count,
          queryMessages: nonEmpty(search.messages),
        }),
      },
      items,
      truncated: search.count > items.length,
    };
  }
}

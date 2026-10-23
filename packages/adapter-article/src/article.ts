import { extractFromHtml } from '@extractus/article-extractor';
import { Readability } from '@mozilla/readability';
import { decodeHTML } from 'entities';
import { DOMParser } from 'linkedom';
import type { ContentItem, ContentLocator, ItemAdapter, NormalizedDocument } from '@owlieio/core';
import type {
  DeclaredArticleSignal,
  DeferredResponseItemAdapter,
  ExtractionWarning,
  HttpBytesResponse,
  HttpTextResponse,
} from '@owlieio/core';
import {
  assertSafeHttpUrl,
  declaredArticleSignal,
  buildProvenance,
  CancelledError,
  extractionFetchedAt,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  isHtmlContentType,
  isPdfContentType,
  startsWithPdfSignature,
  stopAtFeedHeader,
  type ExtractionOptions,
  type HttpFetcher,
  type ErrorDetails,
  type HttpFetchPolicy,
} from '@owlieio/core';
import {
  DEFAULT_MAX_PDF_BYTES,
  DEFAULT_MAX_PDF_PAGES,
  extractPdfText,
  type PdfLimits,
} from './pdf.js';

export interface ArticleAdapterOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  /** Fetch policy (SSRF opt-in, timeouts, redirects, size, User-Agent). */
  policy?: HttpFetchPolicy;
  /** PDF download and page caps (25 MB and 300 pages by default). */
  pdf?: PdfLimits;
}

function canonicalizeArticleUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  return url.toString();
}

/** Whether a URL's path names a PDF file, so it is fetched as bytes up front. */
function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/** Whether a fetched text response is really a PDF (declared, or by its signature). */
function isPdfResponse(response: HttpTextResponse): boolean {
  return isPdfContentType(response.contentType) || startsWithPdfSignature(response.text);
}

/** Stops a text fetch at its first chunk when the body is a PDF. */
function stopAtPdf(textSoFar: string, contentType: string | null): boolean {
  return isPdfContentType(contentType) || startsWithPdfSignature(textSoFar);
}

/** Warning code when article text was recovered from Readability's unsanitized output. */
export const ARTICLE_TEXT_RECOVERED = 'article_text_recovered';

/** Error codes for an article that yields no usable text, by cause. */
export const ARTICLE_NO_READABLE_TEXT = 'ARTICLE_NO_READABLE_TEXT';
export const ARTICLE_TEXT_DROPPED = 'ARTICLE_TEXT_DROPPED';
export const ARTICLE_TOO_SHORT = 'ARTICLE_TOO_SHORT';

/**
 * The extractor library's own minimum (`contentLengthThreshold`): article text
 * shorter than this is not an article. Applied here, so the adapter can tell
 * why a page came up short.
 */
const MIN_ARTICLE_TEXT_CHARS = 200;

/**
 * Custom element names in a page (HTML spec: a lowercase letter first and a
 * hyphen), lowercased and deduplicated. Design systems built on Web
 * Components wrap whole paragraphs in them (`<uni-article-paragraph>`), and
 * the sanitizer drops any tag it doesn't allow together with its content, so
 * each page's custom tags are allowed for that page (#172).
 */
export function customElementNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<([a-z][a-z0-9._]*-[a-z0-9._-]*)[\s/>]/gi)) {
    names.add(match[1]!.toLowerCase());
  }
  return [...names];
}

/**
 * The plain text Readability itself finds in a page, before sanitizing, with
 * scripts, styles, templates and noscript removed. Empty when it finds none.
 * Uses the same Readability settings as the extractor library.
 */
function readableText(html: string, url: string): string {
  try {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const base = document.createElement('base', {});
    base.setAttribute('href', url);
    document.head?.appendChild(base);
    const result = new Readability(
      document as unknown as ConstructorParameters<typeof Readability>[0],
      {
        nbTopCandidates: 4,
        charThreshold: 400,
        keepClasses: true,
      },
    ).parse();
    // The same rule as the library: no length, title or content is no result.
    if (!result?.length || !result.title || !result.content) return '';
    const content = result.content.replace(/<(template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    return plainText(content);
  } catch {
    return '';
  }
}

/** The declared page type, as an error-details enum. */
function declaredSignalDetail(signal: DeclaredArticleSignal): string {
  return signal === 'og-non-article' ? 'other' : signal;
}

/** Warning code when a PDF had more pages than the page cap. */
export const PDF_TRUNCATED_PAGES = 'PDF_TRUNCATED_PAGES';

/** A fetched page: the text response, plus the raw bytes when the body is a PDF. */
interface FetchedBody {
  response: HttpTextResponse;
  pdf?: HttpBytesResponse;
}

/**
 * Tags {@link https://github.com/extractus/article-extractor | article-extractor}
 * keeps while sanitizing Readability output. It ships with a default allowlist
 * that omits several standard HTML elements, and its `cleanify` step removes a
 * disallowed element *together with its subtree*. When Readability retains a
 * `<main>` (or another semantic wrapper) around an article body, the default
 * allowlist therefore silently drops the entire article. We pass the full
 * default list plus the standard elements Readability may emit so content is
 * preserved rather than discarded.
 */
const ARTICLE_EXTRACTOR_ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'u',
  'b',
  'i',
  'em',
  'strong',
  'small',
  'sup',
  'sub',
  'div',
  'span',
  'p',
  'article',
  'blockquote',
  'section',
  'details',
  'summary',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'dd',
  'dl',
  'table',
  'caption',
  'col',
  'colgroup',
  'th',
  'tr',
  'td',
  'thead',
  'tbody',
  'tfoot',
  'fieldset',
  'legend',
  'figure',
  'figcaption',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'iframe',
  'progress',
  'br',
  'hr',
  'label',
  'abbr',
  'a',
  'svg',
  'main',
  'time',
  'header',
  'footer',
  'nav',
  'aside',
  'address',
  'mark',
  'data',
  'output',
  'del',
  'ins',
  's',
  'q',
  'cite',
  'var',
  'samp',
  'kbd',
  'wbr',
];

/**
 * Minimum readable text length for an undeclared page to count as an article.
 * Pages that declare an article type (`og:type`, JSON-LD) need no minimum.
 */
export const MIN_READABLE_ARTICLE_CHARS = 500;

/** Re-exported for existing consumers; the check lives in `@owlieio/core`. */
export { declaredArticleSignal };
export type { DeclaredArticleSignal };

/**
 * Why a page was, or was not, classified as an article. A PDF is always one
 * (`'pdf'`).
 */
export type ArticlePageSignal = DeclaredArticleSignal | 'readable-body' | 'pdf';

/** The result of {@link ArticleAdapter.classify}. */
export interface ArticlePageClassification {
  isArticle: boolean;
  signal: ArticlePageSignal;
  /** The fetched page, reusable by other consumers such as feed discovery. */
  response: HttpTextResponse;
  /** The extracted document whenever the page yielded readable text. */
  document?: NormalizedDocument;
}

/** Elements whose start or end separates paragraphs (a blank line). */
const PARAGRAPH_TAGS =
  'p|div|h[1-6]|blockquote|ul|ol|dl|table|caption|article|section|main|header|footer|aside|nav|address|figure|figcaption|details|summary|fieldset|legend|hr|pre';
/** Elements that start a new line within a block. */
const LINE_TAGS = 'li|tr|dt|dd|br';
/**
 * Inline elements are removed without a separator so words they wrap stay
 * joined to surrounding text (`<em>x</em>.`). Any other tag, including table
 * cells and block elements not listed above, becomes a space, so text it
 * separated never runs together.
 */
const INLINE_TAGS =
  'a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|font|i|img|ins|kbd|label|mark|output|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr';

/** Marks a preformatted block's position until its text is put back. */
const PRE_PLACEHOLDER = /\uE000(\d+)\uE000/g;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Turns extracted article HTML into plain text that keeps its structure:
 * paragraphs, headings and other blocks are separated by a blank line, list
 * items, table rows and `<br>` start a new line, and `<pre>` lines are kept as
 * they are. Tags are removed before entities are decoded, so escaped text such
 * as `&lt;div&gt;` survives as literal `<div>`.
 */
function plainText(html: string): string {
  const preformatted: string[] = [];
  const body = html
    .replace(/\uE000/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_match, inner: string) => {
      const lines = inner.replace(/<br\b[^>]*>/gi, '\n');
      const text = decodeHTML(stripTags(lines)).replace(/^\n+|\s+$/g, '');
      // An empty block is only a separator, so normal collapsing applies to it.
      if (!text) return '\n\n';
      preformatted.push(text);
      return `\n\n\uE000${preformatted.length - 1}\uE000\n\n`;
    })
    // Source whitespace (indentation, soft wraps) is not meaningful in HTML.
    .replace(/[ \t\r\n\f]+/g, ' ')
    .replace(new RegExp(`<\\/?(?:${PARAGRAPH_TAGS})\\b[^>]*>`, 'gi'), '\n\n')
    .replace(new RegExp(`<(?:${LINE_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(new RegExp(`<\\/?(?:${INLINE_TAGS})\\b[^>]*>`, 'gi'), '');

  return decodeHTML(body.replace(/<[^>]*>/g, ' '))
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(PRE_PLACEHOLDER, (_match, index: string) => preformatted[Number(index)] ?? '');
}

/**
 * Canonicalizes a publisher-provided timestamp to the same stable ISO 8601 UTC
 * form the RSS adapter emits. `@extractus/article-extractor` has changed its
 * published-time formatting across releases (dropping or adding millisecond
 * precision), so normalizing here keeps adapter output stable and consistent
 * across sources. Unparseable values pass through unchanged.
 */
export function normalizeDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/**
 * Static editorial-page adapter. It accepts only safe HTTP(S) URLs and gives
 * the extractor bounded HTML obtained through Owlie's safe HTTP seam. A PDF
 * (a `.pdf` path, a declared `application/pdf` body, or a body that starts with
 * `%PDF-`) is fetched as bytes and read as a text document with
 * `metadata.format: 'pdf'` (ADR 0039).
 */
export class ArticleAdapter implements ItemAdapter, DeferredResponseItemAdapter {
  static readonly id = 'article';
  readonly id = ArticleAdapter.id;
  readonly sourceType = 'article' as const;

  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;
  private readonly pdfLimits: Required<PdfLimits>;

  constructor(options: ArticleAdapterOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
    this.pdfLimits = {
      maxBytes: options.pdf?.maxBytes ?? DEFAULT_MAX_PDF_BYTES,
      maxPages: options.pdf?.maxPages ?? DEFAULT_MAX_PDF_PAGES,
    };
  }

  recognize(locator: ContentLocator): boolean {
    try {
      assertSafeHttpUrl(locator.url, { allowPrivateHosts: this.policy?.allowPrivateHosts });
      return true;
    } catch {
      return false;
    }
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    if (!this.recognize(locator)) {
      throw new ConfigurationError(`not a recognized safe article URL: ${locator.url}`);
    }
    const canonicalUrl = canonicalizeArticleUrl(locator.url);
    return {
      id: `article:${canonicalUrl}`,
      sourceType: 'article',
      canonicalUrl,
      metadata: {},
    };
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    const target = item.id;
    options.progress?.emit({ type: 'started', target });

    try {
      if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');
      const body = await this.fetchBody(item.canonicalUrl, options.signal);
      const document = await this.extractFromBody(body, options);
      options.progress?.emit({ type: 'completed', target, result: document });
      return document;
    } catch (error) {
      this.emitFailure(target, options, error);
    }
  }

  /**
   * Extracts from a response already fetched and safe-validated by core,
   * avoiding a second request when the fallback dispatch hands one over. It is
   * an internal fallback seam, not a public path for arbitrary caller HTML.
   */
  async extractDeferred(
    item: ContentItem,
    response: HttpTextResponse,
    options: ExtractionOptions = {},
  ): Promise<NormalizedDocument> {
    const target = item.id;
    options.progress?.emit({ type: 'started', target });

    try {
      if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');
      // Only consume a response whose final URL is safe-validated by core.
      assertSafeHttpUrl(response.url, { allowPrivateHosts: this.policy?.allowPrivateHosts });
      const body = await this.fetchBody(response.url, options.signal, response);
      const document = await this.extractFromBody(body, options);
      options.progress?.emit({ type: 'completed', target, result: document });
      return document;
    } catch (error) {
      this.emitFailure(target, options, error);
    }
  }

  /**
   * Decides whether a page is an article, from one fetched response (the
   * supplied `response`, or a single fetch of the item URL). A page that
   * declares an article type (`og:type`, JSON-LD) is an article when it yields
   * readable text; an undeclared page is one when its readable text reaches
   * {@link MIN_READABLE_ARTICLE_CHARS}; a page whose `og:type` declares another
   * type is not. A PDF is always an article, and a PDF that cannot be read
   * (encrypted, scanned, malformed) fails rather than counting as "not an
   * article". The response is returned so a caller can reuse it.
   */
  async classify(
    item: ContentItem,
    options: ExtractionOptions & { response?: HttpTextResponse } = {},
  ): Promise<ArticlePageClassification> {
    if (options.signal?.aborted) throw new CancelledError('article classification cancelled');
    // A feed is never an article; its header is enough for discovery. A PDF
    // stops at its first chunk and is re-fetched as bytes.
    const body = await this.fetchBody(
      item.canonicalUrl,
      options.signal,
      options.response,
      stopAtFeedHeader(),
    );
    const response = body.response;
    assertSafeHttpUrl(response.url, { allowPrivateHosts: this.policy?.allowPrivateHosts });
    if (body.pdf) {
      const document = await this.extractFromPdf(body.pdf, options);
      options.progress?.emit({ type: 'started', target: item.id });
      options.progress?.emit({ type: 'completed', target: item.id, result: document });
      return { isArticle: true, signal: 'pdf', response, document };
    }
    if (!isHtmlContentType(response.contentType)) {
      return { isArticle: false, signal: 'none', response };
    }

    const declared = declaredArticleSignal(response.text);
    let document: NormalizedDocument | undefined;
    try {
      document = await this.extractFromResponse(response, options);
    } catch (error) {
      if (error instanceof CancelledError || options.signal?.aborted) throw error;
      if (!(error instanceof ExtractionError)) throw error;
    }

    let signal: ArticlePageSignal = declared;
    let isArticle = false;
    if (document !== undefined) {
      if (declared === 'og-article' || declared === 'json-ld-article') {
        isArticle = true;
      } else if (declared === 'none' && document.text.length >= MIN_READABLE_ARTICLE_CHARS) {
        isArticle = true;
        signal = 'readable-body';
      }
    }
    if (isArticle) {
      options.progress?.emit({ type: 'started', target: item.id });
      options.progress?.emit({ type: 'completed', target: item.id, result: document! });
    }
    return { isArticle, signal, response, ...(document ? { document } : {}) };
  }

  /**
   * Fetches a page, or reuses `given`, and fetches it again as bytes when it
   * turns out to be a PDF. A `.pdf` URL is fetched as bytes straight away; if
   * its body is not a PDF after all (a page behind a `.pdf` path), the bytes
   * are decoded and handled as the text response they are.
   */
  private async fetchBody(
    url: string,
    signal: AbortSignal | undefined,
    given?: HttpTextResponse,
    stopReading: (textSoFar: string, contentType: string | null) => boolean = stopAtPdf,
  ): Promise<FetchedBody> {
    let response = given;
    if (response === undefined && !isPdfUrl(url)) {
      response = await this.fetcher.fetch(url, { signal, policy: this.policy, stopReading });
    }
    if (response !== undefined && !isPdfResponse(response)) return { response };

    if (!this.fetcher.fetchBytes) {
      throw new ExtractionError('PDF extraction needs a fetcher that can read binary responses');
    }
    const pdf = await this.fetcher.fetchBytes(response?.url ?? url, {
      signal,
      policy: this.policy,
      maxBytes: this.pdfLimits.maxBytes,
    });
    if (startsWithPdfSignature(pdf.bytes)) {
      return {
        response: response ?? {
          url: pdf.url,
          contentType: pdf.contentType,
          text: '',
          partial: true,
        },
        pdf,
      };
    }
    if (isPdfContentType(pdf.contentType)) {
      throw new ExtractionError(`response declares a PDF but its body is not one: ${pdf.url}`);
    }
    return {
      response: {
        url: pdf.url,
        contentType: pdf.contentType,
        text: new TextDecoder().decode(pdf.bytes),
      },
    };
  }

  private async extractFromBody(
    body: FetchedBody,
    options: ExtractionOptions,
  ): Promise<NormalizedDocument> {
    return body.pdf
      ? await this.extractFromPdf(body.pdf, options)
      : await this.extractFromResponse(body.response, options);
  }

  private async extractFromPdf(
    pdf: HttpBytesResponse,
    options: ExtractionOptions,
  ): Promise<NormalizedDocument> {
    const result = await extractPdfText(pdf.bytes, {
      maxPages: this.pdfLimits.maxPages,
      signal: options.signal,
    });
    const canonicalUrl = canonicalizeArticleUrl(pdf.url);
    const warnings: ExtractionWarning[] =
      result.pagesRead < result.pageCount
        ? [
            {
              code: PDF_TRUNCATED_PAGES,
              message: `read the first ${result.pagesRead} of ${result.pageCount} PDF pages`,
            },
          ]
        : [];
    return {
      schemaVersion: 2,
      id: `article:${canonicalUrl}`,
      sourceType: 'article',
      canonicalUrl,
      mediaType: 'text',
      ...(result.title ? { title: result.title } : {}),
      text: result.text,
      ...(result.createdAt ? { publishedAt: result.createdAt } : {}),
      ...(result.author ? { author: result.author } : {}),
      metadata: { format: 'pdf', pageCount: result.pageCount, pagesRead: result.pagesRead },
      provenance: buildProvenance({
        sourceId: `article:${canonicalUrl}`,
        canonicalUrl,
        adapterId: ArticleAdapter.id,
        text: result.text,
        fetchedAt: extractionFetchedAt(options),
        warnings,
      }),
    };
  }

  private async extractFromResponse(
    response: HttpTextResponse,
    options: ExtractionOptions,
  ): Promise<NormalizedDocument> {
    if (!isHtmlContentType(response.contentType)) {
      throw new ExtractionError(
        `article URL returned unsupported content type: ${response.contentType ?? 'missing'}`,
      );
    }
    if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');

    const customTags = customElementNames(response.text);
    // The library's length threshold is applied below instead, so a page that
    // comes up short can be told apart from one whose text was dropped.
    const article = await extractFromHtml(response.text, response.url, {
      allowedTags: [...ARTICLE_EXTRACTOR_ALLOWED_TAGS, ...customTags],
      contentLengthThreshold: 0,
    });
    if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');
    let text = plainText(article?.content ?? '');
    const warnings: ExtractionWarning[] = [];
    if (text.length < MIN_ARTICLE_TEXT_CHARS) {
      text = this.recoverOrExplain(response, text, customTags.length);
      warnings.push({
        code: ARTICLE_TEXT_RECOVERED,
        message: 'article text recovered from unsanitized readable content',
      });
    }

    const canonicalUrl = canonicalizeArticleUrl(response.url);
    return {
      schemaVersion: 2,
      id: `article:${canonicalUrl}`,
      sourceType: 'article',
      canonicalUrl,
      mediaType: 'text',
      ...(article?.title ? { title: article.title } : {}),
      text,
      ...(article?.published ? { publishedAt: normalizeDate(article.published) } : {}),
      ...(article?.author ? { author: article.author } : {}),
      metadata: {},
      provenance: buildProvenance({
        sourceId: `article:${canonicalUrl}`,
        canonicalUrl,
        adapterId: ArticleAdapter.id,
        text,
        fetchedAt: extractionFetchedAt(options),
        warnings,
      }),
    };
  }

  /**
   * For a page whose sanitized text came up short: returns Readability's own
   * text when the page is an article and that text is long enough, or throws
   * an {@link ExtractionError} whose code says why the page has no text
   * (with counts in `details`). The message stays the same for every cause.
   */
  private recoverOrExplain(
    response: HttpTextResponse,
    sanitized: string,
    customElementCount: number,
  ): string {
    const declared = declaredArticleSignal(response.text);
    const readable = readableText(response.text, response.url);
    const details: ErrorDetails = {
      declaredSignal: declaredSignalDetail(declared),
      htmlBytes: Buffer.byteLength(response.text),
      readableChars: readable.length,
      sanitizedChars: sanitized.length,
      customElementCount,
    };
    const eligible =
      declared === 'og-article' ||
      declared === 'json-ld-article' ||
      (declared === 'none' && readable.length >= MIN_READABLE_ARTICLE_CHARS);
    if (eligible && readable.length >= MIN_ARTICLE_TEXT_CHARS) return readable;

    const code =
      readable.length === 0
        ? ARTICLE_NO_READABLE_TEXT
        : readable.length < MIN_ARTICLE_TEXT_CHARS
          ? ARTICLE_TOO_SHORT
          : ARTICLE_TEXT_DROPPED;
    throw new ExtractionError(`no readable static article content at ${response.url}`, {
      code,
      details,
    });
  }

  private emitFailure(target: string, options: ExtractionOptions, error: unknown): never {
    if (error instanceof CancelledError) {
      options.progress?.emit({ type: 'cancelled', target });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      options.progress?.emit({ type: 'failed', target, error: message });
    }
    throw error;
  }
}

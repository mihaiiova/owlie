import { extractFromHtml } from '@extractus/article-extractor';
import { decodeHTML } from 'entities';
import type { ContentItem, ContentLocator, ItemAdapter, NormalizedDocument } from '@owlieio/core';
import type {
  DeclaredArticleSignal,
  DeferredResponseItemAdapter,
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
  type ExtractionOptions,
  type HttpFetcher,
  type HttpFetchPolicy,
} from '@owlieio/core';

export interface ArticleAdapterOptions {
  /** Fetch seam; defaults to the safe core {@link DefaultHttpFetcher}. */
  fetcher?: HttpFetcher;
  /** Fetch policy (SSRF opt-in, timeouts, redirects, size, User-Agent). */
  policy?: HttpFetchPolicy;
}

function canonicalizeArticleUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  return url.toString();
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

/** Why a page was, or was not, classified as an article. */
export type ArticlePageSignal = DeclaredArticleSignal | 'readable-body';

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
  'p|div|h[1-6]|blockquote|ul|ol|dl|table|article|section|main|header|footer|aside|nav|address|figure|figcaption|hr|pre';
/** Elements that start a new line within a block. */
const LINE_TAGS = 'li|tr|dt|dd|br';
/** Table cells are separated by a space so adjacent cells don't run together. */
const CELL_TAGS = 'td|th';

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
      preformatted.push(decodeHTML(stripTags(inner)).replace(/^\n+|\s+$/g, ''));
      return `\n\n\uE000${preformatted.length - 1}\uE000\n\n`;
    })
    // Source whitespace (indentation, soft wraps) is not meaningful in HTML.
    .replace(/[ \t\r\n\f]+/g, ' ')
    .replace(new RegExp(`<\\/?(?:${PARAGRAPH_TAGS})\\b[^>]*>`, 'gi'), '\n\n')
    .replace(new RegExp(`<(?:${LINE_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(new RegExp(`<\\/?(?:${CELL_TAGS})\\b[^>]*>`, 'gi'), ' ');

  return decodeHTML(stripTags(body))
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
 * the extractor bounded HTML obtained through Owlie's safe HTTP seam.
 */
export class ArticleAdapter implements ItemAdapter, DeferredResponseItemAdapter {
  static readonly id = 'article';
  readonly id = ArticleAdapter.id;
  readonly sourceType = 'article' as const;

  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;

  constructor(options: ArticleAdapterOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
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
      const response = await this.fetcher.fetch(item.canonicalUrl, {
        signal: options.signal,
        policy: this.policy,
      });
      const document = await this.extractFromResponse(response, options);
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
      const document = await this.extractFromResponse(response, options);
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
   * type is not. The response is returned so a caller can reuse it.
   */
  async classify(
    item: ContentItem,
    options: ExtractionOptions & { response?: HttpTextResponse } = {},
  ): Promise<ArticlePageClassification> {
    if (options.signal?.aborted) throw new CancelledError('article classification cancelled');
    const response =
      options.response ??
      (await this.fetcher.fetch(item.canonicalUrl, {
        signal: options.signal,
        policy: this.policy,
      }));
    assertSafeHttpUrl(response.url, { allowPrivateHosts: this.policy?.allowPrivateHosts });
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

    const article = await extractFromHtml(response.text, response.url, {
      allowedTags: ARTICLE_EXTRACTOR_ALLOWED_TAGS,
    });
    if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');
    const text = plainText(article?.content ?? '');
    if (!text) {
      throw new ExtractionError(`no readable static article content at ${response.url}`);
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
      }),
    };
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

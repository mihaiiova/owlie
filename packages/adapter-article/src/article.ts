import { extractFromHtml } from '@extractus/article-extractor';
import { decodeHTML } from 'entities';
import type { ContentItem, ContentLocator, ItemAdapter, NormalizedDocument } from '@owlieio/core';
import type { DeferredResponseItemAdapter, HttpTextResponse } from '@owlieio/core';
import {
  assertSafeHttpUrl,
  CancelledError,
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

function plainText(html: string): string {
  return decodeHTML(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      schemaVersion: 1,
      id: `article:${canonicalUrl}`,
      sourceType: 'article',
      canonicalUrl,
      mediaType: 'text',
      ...(article?.title ? { title: article.title } : {}),
      text,
      ...(article?.published ? { publishedAt: normalizeDate(article.published) } : {}),
      ...(article?.author ? { author: article.author } : {}),
      metadata: {},
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

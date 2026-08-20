import { extractFromHtml } from '@extractus/article-extractor';
import type { ContentItem, ContentLocator, ItemAdapter, NormalizedDocument } from '@owlieio/core';
import {
  assertSafeHttpUrl,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
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

function isHtmlContentType(contentType: string | null): boolean {
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'text/html' || mediaType === 'application/xhtml+xml';
}

function plainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Static editorial-page adapter. It accepts only safe HTTP(S) URLs and gives
 * the extractor bounded HTML obtained through Owlie's safe HTTP seam.
 */
export class ArticleAdapter implements ItemAdapter {
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
      assertSafeHttpUrl(locator.url);
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
      if (!isHtmlContentType(response.contentType)) {
        throw new ExtractionError(
          `article URL returned unsupported content type: ${response.contentType ?? 'missing'}`,
        );
      }
      if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');

      const article = await extractFromHtml(response.text, response.url);
      if (options.signal?.aborted) throw new CancelledError('article extraction cancelled');
      const text = plainText(article?.content ?? '');
      if (!text) {
        throw new ExtractionError(`no readable static article content at ${response.url}`);
      }

      const canonicalUrl = canonicalizeArticleUrl(response.url);
      const document: NormalizedDocument = {
        schemaVersion: 1,
        id: `article:${canonicalUrl}`,
        sourceType: 'article',
        canonicalUrl,
        mediaType: 'text',
        ...(article?.title ? { title: article.title } : {}),
        text,
        ...(article?.published ? { publishedAt: article.published } : {}),
        ...(article?.author ? { author: article.author } : {}),
        metadata: {},
      };
      options.progress?.emit({ type: 'completed', target, result: document });
      return document;
    } catch (error) {
      if (error instanceof CancelledError) {
        options.progress?.emit({ type: 'cancelled', target });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        options.progress?.emit({ type: 'failed', target, error: message });
      }
      throw error;
    }
  }
}

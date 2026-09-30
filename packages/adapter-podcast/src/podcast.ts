import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  ExtractionOptions,
  HttpFetcher,
  HttpFetchPolicy,
  ItemAdapter,
  ResolutionOptions,
  Transcriber,
} from '@owlieio/core';
import type { ContentItem, ContentLocator, NormalizedDocument } from '@owlieio/core';
import {
  assertSafeHttpUrl,
  buildProvenance,
  CancelledError,
  extractionFetchedAt,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  isFeedContentType,
  isHtmlContentType,
  isJsonContentType,
  NotHandledError,
} from '@owlieio/core';
import { parseFeed } from '@owlieio/adapter-rss';
import type { FeedEnclosure } from '@owlieio/adapter-rss';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac'];
const MEDIA_MAX_BYTES = 512 * 1024 * 1024;

/** Resolves a podcast locator to direct media without coupling the adapter to a provider. */
export interface PodcastAudioResolver {
  recognize(locator: ContentLocator): boolean;
  resolve(
    locator: ContentLocator,
    options?: { signal?: AbortSignal },
  ): Promise<{ mediaUrl: string; metadata?: Record<string, unknown> }>;
}

/** Direct-media foundation resolver; future episode-page resolvers share this seam. */
export class DirectMediaResolver implements PodcastAudioResolver {
  recognize(locator: ContentLocator): boolean {
    return recognizePodcastUrl(locator.url);
  }
  async resolve(
    locator: ContentLocator,
  ): Promise<{ mediaUrl: string; metadata?: Record<string, unknown> }> {
    if (!this.recognize(locator))
      throw new ConfigurationError(`not a recognized podcast media URL: ${locator.url}`);
    return { mediaUrl: assertSafeHttpUrl(locator.url).toString() };
  }
}

export interface GenericEpisodePageResolverOptions {
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
}

type ResolvedAudio = { mediaUrl: string; title?: string };

/**
 * Resolves declarative audio metadata from a server-rendered podcast episode
 * page. It deliberately does not execute page scripts or scrape page prose.
 */
export class GenericEpisodePageResolver implements PodcastAudioResolver {
  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;

  constructor(options: GenericEpisodePageResolverOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
  }

  recognize(locator: ContentLocator): boolean {
    if (recognizePodcastUrl(locator.url)) return false;
    try {
      assertSafeHttpUrl(locator.url, { allowPrivateHosts: this.policy?.allowPrivateHosts });
      return true;
    } catch {
      return false;
    }
  }

  async resolve(
    locator: ContentLocator,
    options: { signal?: AbortSignal } = {},
  ): Promise<{ mediaUrl: string; metadata?: Record<string, unknown> }> {
    if (!this.recognize(locator))
      throw new ConfigurationError(`not a recognized podcast episode URL: ${locator.url}`);
    if (options.signal?.aborted) throw new CancelledError('podcast episode resolution cancelled');

    const page = await this.fetcher.fetch(locator.url, {
      signal: options.signal,
      policy: this.policy,
    });
    if (!isHtmlContentType(page.contentType)) {
      throw new NotHandledError(
        `not a podcast episode page: unsupported content type ${page.contentType ?? 'missing'}`,
        { deferredResponse: page },
      );
    }
    const resolved =
      resolveJsonLdAudio(page.text, page.url) ??
      (await this.resolveOembedAudio(page.text, page.url, options.signal)) ??
      resolveAudioElement(page.text, page.url) ??
      (await this.resolveFeedAudio(page.text, page.url, options.signal));
    if (!resolved)
      throw new NotHandledError(`no podcast audio enclosure found at ${page.url}`, {
        deferredResponse: page,
      });

    const safeMediaUrl = assertSafeHttpUrl(resolved.mediaUrl, {
      allowPrivateHosts: this.policy?.allowPrivateHosts,
    }).toString();
    return {
      mediaUrl: safeMediaUrl,
      metadata: {
        ...(resolved.title ? { title: resolved.title } : {}),
        resolvedFrom: 'page',
      },
    };
  }

  private async resolveOembedAudio(
    html: string,
    pageUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<ResolvedAudio | undefined> {
    const link = findTag(html, 'link').find((tag) => {
      const attrs = attributes(tag);
      return attrs.type?.toLowerCase() === 'application/json+oembed' && Boolean(attrs.href);
    });
    if (!link) return undefined;
    try {
      const href = safeResolveUrl(attributes(link).href!, pageUrl);
      if (!href) return undefined;
      const response = await this.fetcher.fetch(href, {
        signal,
        policy: this.policy,
      });
      if (!isJsonContentType(response.contentType)) return undefined;
      const data: unknown = JSON.parse(response.text);
      if (!data || typeof data !== 'object') return undefined;
      const record = data as Record<string, unknown>;
      if (!isAudioOembedType(record.type)) return undefined;
      if (typeof record.url !== 'string') return undefined;
      const mediaUrl = safeResolveUrl(record.url, response.url);
      return mediaUrl ? { mediaUrl, title: stringValue(record.title) } : undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveFeedAudio(
    html: string,
    pageUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<ResolvedAudio | undefined> {
    const inline = resolveEnclosure(html, pageUrl);
    if (inline) return inline;
    const feed = findTag(html, 'link').find((tag) => {
      const attrs = attributes(tag);
      return (
        attrs.rel?.toLowerCase().split(/\s+/).includes('alternate') &&
        Boolean(attrs.href) &&
        /(?:rss|atom|xml)/i.test(attrs.type ?? attrs.href ?? '')
      );
    });
    if (!feed) return undefined;
    try {
      const href = safeResolveUrl(decodeAmpersands(attributes(feed).href!), pageUrl);
      if (!href) return undefined;
      const response = await this.fetcher.fetch(href, {
        signal,
        policy: this.policy,
      });
      if (!isFeedContentType(response.contentType)) return undefined;
      return feedEntryAudio(await parseFeed(response.text), response.url, pageUrl);
    } catch {
      return undefined;
    }
  }
}

function resolveJsonLdAudio(html: string, pageUrl: string): ResolvedAudio | undefined {
  for (const script of html.matchAll(
    /<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      const found = findJsonLdAudio(JSON.parse(script[2] ?? ''));
      if (!found) continue;
      const mediaUrl = safeResolveUrl(found.mediaUrl, pageUrl);
      if (mediaUrl && !isSameUrl(mediaUrl, pageUrl)) {
        return { mediaUrl, title: found.title };
      }
    } catch {
      // A malformed publisher block must not prevent lower-priority signals.
    }
  }
  return undefined;
}

function findJsonLdAudio(value: unknown): ResolvedAudio | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findJsonLdAudio(entry);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  const isAudio = types.some((type) =>
    ['AudioObject', 'PodcastEpisode', 'MusicRecording'].includes(String(type)),
  );
  // A container type's own `url` is usually the page, not the media, so prefer
  // nested media fields before a node's own URL.
  for (const key of ['associatedMedia', 'audio', 'encoding', 'subjectOf', '@graph']) {
    const found = findJsonLdAudio(record[key]);
    if (found) return { ...found, title: stringValue(record.name) ?? found.title };
  }
  if (isAudio) {
    const ownUrl = [record.contentUrl, record.embedUrl, record.url].find(
      (candidate): candidate is string => typeof candidate === 'string',
    );
    if (ownUrl) return { mediaUrl: ownUrl, title: stringValue(record.name) };
  }
  return undefined;
}

function resolveAudioElement(html: string, pageUrl: string): ResolvedAudio | undefined {
  const mediaUrl = audioUrlFromHtml(html, pageUrl);
  return mediaUrl ? { mediaUrl } : undefined;
}

/**
 * The first audio URL declared by the page: an `<audio src>`, a `<source>`
 * inside an `<audio>` element, or a standalone `<source>` whose type is audio.
 * `<video>` and `<picture>` sources never count.
 */
function audioUrlFromHtml(html: unknown, pageUrl: string): string | undefined {
  if (typeof html !== 'string') return undefined;
  const audioSources = [...html.matchAll(/<audio\b[\s\S]*?<\/audio\s*>/gi)].flatMap((block) =>
    findTag(block[0], 'source'),
  );
  const typedSources = findTag(html, 'source').filter((tag) => isAudioType(attributes(tag).type));
  for (const tag of [...findTag(html, 'audio'), ...audioSources, ...typedSources]) {
    const src = attributes(tag).src;
    const mediaUrl = src ? safeResolveUrl(decodeAmpersands(src), pageUrl) : undefined;
    if (mediaUrl) return mediaUrl;
  }
  return undefined;
}

/** An `<enclosure>` or `<link rel="enclosure">` in page markup, when it is audio. */
function resolveEnclosure(markup: string, baseUrl: string): ResolvedAudio | undefined {
  for (const tag of [...findTag(markup, 'enclosure'), ...findTag(markup, 'link')]) {
    const attrs = attributes(tag);
    const candidate =
      attrs.url ??
      (attrs.rel?.toLowerCase().split(/\s+/).includes('enclosure') ? attrs.href : undefined);
    if (candidate === undefined || !isAudioMedia(candidate, attrs.type)) continue;
    const mediaUrl = safeResolveUrl(decodeAmpersands(candidate), baseUrl);
    if (mediaUrl) return { mediaUrl };
  }
  return undefined;
}

/**
 * The audio enclosure of the feed entry whose link is this page. Other
 * entries' enclosures are never used: a page is not the site's latest episode.
 */
function feedEntryAudio(
  feed: Awaited<ReturnType<typeof parseFeed>>,
  feedUrl: string,
  pageUrl: string,
): ResolvedAudio | undefined {
  const entry = feed.entries.find((candidate) => {
    const link = candidate.url ? safeResolveUrl(candidate.url, feedUrl) : undefined;
    return link !== undefined && isSameEpisodeUrl(link, pageUrl);
  });
  const enclosures = (entry?.metadata.enclosures as FeedEnclosure[] | undefined) ?? [];
  const audio = enclosures.find((enclosure) => isAudioMedia(enclosure.url, enclosure.type));
  const mediaUrl = audio ? safeResolveUrl(audio.url, feedUrl) : undefined;
  return mediaUrl ? { mediaUrl, title: entry?.title } : undefined;
}

function isAudioType(type: string | undefined): boolean {
  return type?.trim().toLowerCase().startsWith('audio/') ?? false;
}

/** Audio by declared type, or by file extension when no type is declared. */
function isAudioMedia(url: string, type: string | undefined): boolean {
  if (type !== undefined && type.trim() !== '') return isAudioType(type);
  try {
    const path = new URL(url, 'https://base.invalid/').pathname.toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    return false;
  }
}

/** Compares page URLs ignoring fragment, a trailing slash, host case, and http/https. */
function isSameEpisodeUrl(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const url = new URL(value);
    url.hash = '';
    url.protocol = 'https:';
    return url.toString().replace(/\/$/, '');
  };
  try {
    return normalize(a) === normalize(b);
  } catch {
    return false;
  }
}

/** Decodes the `&amp;` entity in attribute-borne URLs from static HTML. */
function decodeAmpersands(value: string): string {
  return value.replace(/&amp;|&#0*38;|&#x0*26;/gi, '&');
}

function findTag(markup: string, name: string): string[] {
  return markup.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
    const name = match[1];
    const value = match[3];
    if (name !== undefined && value !== undefined) result[name.toLowerCase()] = value;
  }
  return result;
}

/** Resolves a possibly-relative URL against a base; `undefined` when malformed. */
function safeResolveUrl(value: string, baseUrl: string): string | undefined {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/** Compares two absolute URLs ignoring the fragment. */
function isSameUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.toString() === right.toString();
  } catch {
    return a === b;
  }
}

/** Accepts oEmbed responses whose declared type can carry an enclosure. */
function isAudioOembedType(type: unknown): boolean {
  if (typeof type !== 'string' || type.trim() === '') return true;
  return ['rich', 'video', 'audio'].includes(type.trim().toLowerCase());
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Detects a podcast media URL by file extension. Pure; makes no network calls. */
export function recognizePodcastUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      AUDIO_EXTENSIONS.some((ext) => url.pathname.toLowerCase().endsWith(ext))
    );
  } catch {
    return false;
  }
}

export interface PodcastAdapterOptions {
  fetcher: HttpFetcher;
  transcriber: Transcriber;
  cacheDir: string;
  /** Bounded-download policy supplied by the invoking application. */
  mediaFetchPolicy?: HttpFetchPolicy;
  resolvers?: readonly PodcastAudioResolver[];
}

/** Downloads direct podcast media through core's safe binary seam and transcribes it. */
export class PodcastAdapter implements ItemAdapter {
  static readonly id = 'podcast';
  readonly id = PodcastAdapter.id;
  readonly sourceType = 'podcast' as const;
  private readonly fetcher?: HttpFetcher;
  private readonly transcriber?: Transcriber;
  private readonly cacheDir?: string;
  private readonly mediaFetchPolicy: HttpFetchPolicy;
  private readonly resolvers: readonly PodcastAudioResolver[];

  constructor(options?: PodcastAdapterOptions) {
    this.fetcher = options?.fetcher;
    this.transcriber = options?.transcriber;
    this.cacheDir = options?.cacheDir;
    this.mediaFetchPolicy = { maxResponseBytes: MEDIA_MAX_BYTES, ...options?.mediaFetchPolicy };
    this.resolvers = options?.resolvers ?? [new DirectMediaResolver()];
  }

  recognize(locator: ContentLocator): boolean {
    return (
      this.resolvers.some((resolver) => resolver.recognize(locator)) || locator.hint === 'podcast'
    );
  }

  async resolveItem(
    locator: ContentLocator,
    options: ResolutionOptions = {},
  ): Promise<ContentItem> {
    const resolver = this.resolvers.find((candidate) => candidate.recognize(locator));
    if (!resolver && locator.hint !== 'podcast')
      throw new ConfigurationError(`not a recognized podcast media URL: ${locator.url}`);
    const resolved = resolver
      ? await resolver.resolve(locator, { signal: options.signal })
      : { mediaUrl: locator.url };
    return {
      id: `podcast:episode:${resolved.mediaUrl}`,
      sourceType: 'podcast',
      canonicalUrl: resolved.mediaUrl,
      metadata: { platform: 'podcast', ...(resolved.metadata ?? {}) },
    };
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    if (options.signal?.aborted) throw new CancelledError('podcast extraction cancelled');
    if (!this.fetcher?.fetchToFile || !this.transcriber || !this.cacheDir) {
      throw new ConfigurationError(
        'podcast extraction requires a fetcher, transcriber, and cache directory',
      );
    }
    await mkdir(this.cacheDir, { recursive: true });
    const workDir = await mkdtemp(join(this.cacheDir, 'podcast-'));
    const fileName = basename(new URL(item.canonicalUrl).pathname) || 'audio';
    const mediaPath = join(workDir, fileName);
    options.progress?.emit({ type: 'started', target: item.canonicalUrl });
    try {
      await this.fetcher.fetchToFile!(item.canonicalUrl, mediaPath, {
        signal: options.signal,
        policy: this.mediaFetchPolicy,
      });
      options.progress?.emit({
        type: 'progress',
        target: item.canonicalUrl,
        current: 1,
        total: 2,
        message: 'transcribing audio',
      });
      const result = await this.transcriber.transcribe(
        { mediaUrl: item.canonicalUrl, mediaPath, metadata: item.metadata },
        { signal: options.signal, progress: options.progress },
      );
      const document: NormalizedDocument = {
        schemaVersion: 2,
        id: item.id,
        sourceType: 'podcast',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'transcript',
        text: result.text,
        metadata: {
          ...item.metadata,
          ...result.metadata,
          language: result.language,
          segments: result.segments,
        },
        provenance: buildProvenance({
          sourceId: item.id,
          canonicalUrl: item.canonicalUrl,
          adapterId: PodcastAdapter.id,
          text: result.text,
          fetchedAt: extractionFetchedAt(options),
          language: result.language,
        }),
      };
      options.progress?.emit({ type: 'completed', target: item.canonicalUrl, result: document });
      return document;
    } catch (cause) {
      if (cause instanceof CancelledError || options.signal?.aborted) {
        options.progress?.emit({ type: 'cancelled', target: item.canonicalUrl });
        throw new CancelledError('podcast extraction cancelled', { cause });
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      options.progress?.emit({ type: 'failed', target: item.canonicalUrl, error: message });
      throw new ExtractionError(`podcast extraction failed: ${message}`, { cause });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

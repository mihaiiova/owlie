import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ExtractionOptions, HttpFetcher, ItemAdapter, Transcriber } from '@owlieio/core';
import type { ContentItem, ContentLocator, NormalizedDocument } from '@owlieio/core';
import { CancelledError, ConfigurationError, ExtractionError } from '@owlieio/core';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac'];
const MEDIA_MAX_BYTES = 512 * 1024 * 1024;

/** Resolves a podcast locator to direct media without coupling the adapter to a provider. */
export interface PodcastAudioResolver {
  recognize(locator: ContentLocator): boolean;
  resolve(
    locator: ContentLocator,
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
    return { mediaUrl: locator.url };
  }
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
  private readonly resolvers: readonly PodcastAudioResolver[];

  constructor(options?: PodcastAdapterOptions) {
    this.fetcher = options?.fetcher;
    this.transcriber = options?.transcriber;
    this.cacheDir = options?.cacheDir;
    this.resolvers = options?.resolvers ?? [new DirectMediaResolver()];
  }

  recognize(locator: ContentLocator): boolean {
    return (
      this.resolvers.some((resolver) => resolver.recognize(locator)) || locator.hint === 'podcast'
    );
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    const resolver = this.resolvers.find((candidate) => candidate.recognize(locator));
    if (!resolver && locator.hint !== 'podcast')
      throw new ConfigurationError(`not a recognized podcast media URL: ${locator.url}`);
    const resolved = resolver ? await resolver.resolve(locator) : { mediaUrl: locator.url };
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
        policy: { maxResponseBytes: MEDIA_MAX_BYTES },
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
        schemaVersion: 1,
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

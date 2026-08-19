import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ExtractionOptions,
  ItemAdapter,
} from '@owlieio/core';
import type {
  ContentCollection,
  ContentItem,
  ContentLocator,
  NormalizedDocument,
} from '@owlieio/core';
import {
  assertBoundedLimit,
  CancelledError,
  ConfigurationError,
  ExtractionError,
  NotImplementedError,
} from '@owlieio/core';
import { DEFAULT_LANGUAGES, DEFAULT_TIMEOUT_MS, YouTubeTranscriptClient } from './transcript.js';
import type { TranscriptClient, YouTubeAdapterOptions } from './transcript.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

/** YouTube video IDs are exactly 11 characters from [A-Za-z0-9_-]. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const CANONICAL_WATCH_URL = 'https://www.youtube.com/watch?v=';

/** Detects whether a URL points at YouTube. Pure; makes no network calls. */
export function recognizeYouTubeUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Detects a YouTube playlist URL (`/playlist` or a `list` query parameter). */
export function isPlaylistUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!recognizeYouTubeUrl(input)) return false;
    return url.pathname === '/playlist' || url.searchParams.has('list');
  } catch {
    return false;
  }
}

/**
 * Extracts a validated video ID from a supported YouTube video URL
 * (`youtube.com/watch?v=<id>` or `youtu.be/<id>`). Returns `null` for
 * malformed or unsupported URLs. Pure; makes no network calls.
 */
export function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (!recognizeYouTubeUrl(input)) return null;
    if (url.hostname.toLowerCase() === 'youtu.be') {
      const id = url.pathname.slice(1);
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return id !== null && VIDEO_ID_PATTERN.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Detects a supported YouTube video URL. */
export function isVideoUrl(input: string): boolean {
  return extractVideoId(input) !== null;
}

/**
 * Canonicalizes a supported YouTube video URL to
 * `https://www.youtube.com/watch?v=<id>`. Throws {@link ConfigurationError}
 * for malformed or unsupported URLs.
 */
export function canonicalizeVideoUrl(input: string): string {
  const videoId = extractVideoId(input);
  if (videoId === null) {
    throw new ConfigurationError(`not a supported YouTube video URL: ${input}`);
  }
  return `${CANONICAL_WATCH_URL}${videoId}`;
}

/**
 * YouTube adapter. Supports individual videos in v0.1; playlists (collections)
 * are recognized and resolved but listing/extraction remain unimplemented.
 */
export class YouTubeAdapter implements CollectionAdapter, ItemAdapter {
  static readonly id = 'youtube';
  readonly id = YouTubeAdapter.id;
  readonly sourceType = 'youtube' as const;

  private readonly client: TranscriptClient;
  private readonly languages: readonly string[];
  private readonly timeoutMs: number;

  constructor(options: YouTubeAdapterOptions = {}) {
    this.client =
      options.client ??
      new YouTubeTranscriptClient({ languages: options.languages, proxy: options.proxy });
    this.languages = options.languages ?? DEFAULT_LANGUAGES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  recognize(locator: ContentLocator): boolean {
    return recognizeYouTubeUrl(locator.url);
  }

  async resolve(locator: ContentLocator): Promise<ContentCollection> {
    if (!isPlaylistUrl(locator.url)) {
      throw new ConfigurationError(`not a YouTube playlist URL: ${locator.url}`);
    }
    const url = new URL(locator.url);
    const playlistId = url.searchParams.get('list') ?? 'unknown';
    return {
      id: `youtube:playlist:${playlistId}`,
      sourceType: 'youtube',
      canonicalUrl: url.toString(),
      metadata: { playlistId, platform: 'youtube' },
    };
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    const videoId = extractVideoId(locator.url);
    if (videoId === null) {
      throw new ConfigurationError(`not a supported YouTube video URL: ${locator.url}`);
    }
    return {
      id: `youtube:video:${videoId}`,
      sourceType: 'youtube',
      canonicalUrl: `${CANONICAL_WATCH_URL}${videoId}`,
      metadata: { videoId, platform: 'youtube' },
    };
  }

  async list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult> {
    assertBoundedLimit(options.limit);
    throw new NotImplementedError(
      `listing YouTube playlists requires network access (${collection.canonicalUrl})`,
    );
  }

  async extract(item: ContentItem, options: ExtractionOptions = {}): Promise<NormalizedDocument> {
    const videoId = this.videoIdFromItem(item);
    const target = item.id;
    options.progress?.emit({ type: 'started', target });

    try {
      const payload = await this.client.fetch(videoId, {
        languages: [...this.languages],
        signal: options.signal,
        timeoutMs: this.timeoutMs,
      });

      const document: NormalizedDocument = {
        schemaVersion: 1,
        id: item.id,
        sourceType: 'youtube',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'transcript',
        text: payload.transcript,
        metadata: {
          videoId: payload.videoId,
          language: payload.language,
          languageCode: payload.languageCode,
          isGenerated: payload.isGenerated,
        },
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

  private videoIdFromItem(item: ContentItem): string {
    const videoId = item.metadata?.videoId;
    if (typeof videoId !== 'string' || videoId === '') {
      throw new ExtractionError(`YouTube item is missing a videoId (${item.id})`);
    }
    return videoId;
  }
}

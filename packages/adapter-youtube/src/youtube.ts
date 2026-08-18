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
import { assertBoundedLimit, ConfigurationError, NotImplementedError } from '@owlieio/core';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

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

/** Detects a YouTube video URL (`/watch` or a `youtu.be` short link). */
export function isVideoUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!recognizeYouTubeUrl(input)) return false;
    if (url.hostname.toLowerCase() === 'youtu.be') return url.pathname.length > 1;
    return url.pathname === '/watch';
  } catch {
    return false;
  }
}

/**
 * YouTube adapter. Supports playlists (collections) and videos (items).
 * Extraction and listing require network access and are intentionally not
 * implemented in this scaffold.
 */
export class YouTubeAdapter implements CollectionAdapter, ItemAdapter {
  static readonly id = 'youtube';
  readonly id = YouTubeAdapter.id;
  readonly sourceType = 'youtube' as const;

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
    if (!isVideoUrl(locator.url)) {
      throw new ConfigurationError(`not a YouTube video URL: ${locator.url}`);
    }
    const url = new URL(locator.url);
    const videoId =
      url.hostname.toLowerCase() === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ?? 'unknown');
    return {
      id: `youtube:video:${videoId}`,
      sourceType: 'youtube',
      canonicalUrl: url.toString(),
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

  async extract(_item: ContentItem, _options?: ExtractionOptions): Promise<NormalizedDocument> {
    throw new NotImplementedError('extracting YouTube videos is not implemented yet');
  }
}

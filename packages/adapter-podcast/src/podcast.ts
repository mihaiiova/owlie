import type { ExtractionOptions, ItemAdapter } from '@owlieio/core';
import type { ContentItem, ContentLocator, NormalizedDocument } from '@owlieio/core';
import { ConfigurationError, NotImplementedError } from '@owlieio/core';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac', '.mp4'];

/** Detects a podcast media URL by file extension. Pure; makes no network calls. */
export function recognizePodcastUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const path = url.pathname.toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Podcast episode adapter. Extraction eventually delegates to a configured
 * {@link Transcriber}; transcription is not implemented in this scaffold.
 */
export class PodcastAdapter implements ItemAdapter {
  readonly id = 'podcast';
  readonly sourceType = 'podcast' as const;

  recognize(locator: ContentLocator): boolean {
    return recognizePodcastUrl(locator.url) || locator.hint === 'podcast';
  }

  async resolveItem(locator: ContentLocator): Promise<ContentItem> {
    if (!recognizePodcastUrl(locator.url) && locator.hint !== 'podcast') {
      throw new ConfigurationError(`not a recognized podcast media URL: ${locator.url}`);
    }
    return {
      id: `podcast:episode:${locator.url}`,
      sourceType: 'podcast',
      canonicalUrl: locator.url,
      metadata: { platform: 'podcast' },
    };
  }

  async extract(_item: ContentItem, _options?: ExtractionOptions): Promise<NormalizedDocument> {
    throw new NotImplementedError(
      'extracting podcast episodes (transcription) is not implemented yet',
    );
  }
}

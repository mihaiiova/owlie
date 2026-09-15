import type { ContentLocator, HttpFetcher, HttpFetchPolicy } from '@owlieio/core';
import { parseFeed } from '@owlieio/adapter-rss';
import {
  assertSafeHttpUrl,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  isFeedContentType,
  isJsonContentType,
} from '@owlieio/core';
import type { PodcastAudioResolver } from './podcast.js';

export interface AppleEpisodeReference {
  country: string;
  podcastId: string;
  episodeId: string;
}

export interface ApplePodcastsResolverOptions {
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
}

type Resolution = { mediaUrl: string; title?: string };

/** Parses an Apple Podcasts episode URL without making network requests. */
export function parseAppleEpisodeUrl(input: string): AppleEpisodeReference | undefined {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'podcasts.apple.com') {
      return undefined;
    }
    const podcastId = url.pathname.match(/\/id(\d+)(?:\/|$)/)?.[1];
    const episodeId = url.searchParams.get('i');
    const country = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    if (
      !podcastId ||
      !episodeId ||
      !/^\d+$/.test(episodeId) ||
      !country ||
      !/^[a-z]{2}$/.test(country)
    ) {
      return undefined;
    }
    return { country, podcastId, episodeId };
  } catch {
    return undefined;
  }
}

/** Resolves Apple Podcasts episode URLs through Apple's public lookup data. */
export class ApplePodcastsResolver implements PodcastAudioResolver {
  private readonly fetcher: HttpFetcher;
  private readonly policy: HttpFetchPolicy | undefined;

  constructor(options: ApplePodcastsResolverOptions = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
    this.policy = options.policy;
  }

  recognize(locator: ContentLocator): boolean {
    return parseAppleEpisodeUrl(locator.url) !== undefined;
  }

  async resolve(
    locator: ContentLocator,
    options: { signal?: AbortSignal } = {},
  ): Promise<{ mediaUrl: string; metadata?: Record<string, unknown> }> {
    const reference = parseAppleEpisodeUrl(locator.url);
    if (!reference)
      throw new ConfigurationError(`not an Apple Podcasts episode URL: ${locator.url}`);
    if (options.signal?.aborted)
      throw new CancelledError('Apple Podcasts episode resolution cancelled');

    const lookupUrl = new URL('https://itunes.apple.com/lookup');
    lookupUrl.searchParams.set('id', reference.podcastId);
    lookupUrl.searchParams.set('entity', 'podcastEpisode');
    lookupUrl.searchParams.set('country', reference.country);
    const lookup = await this.fetcher.fetch(lookupUrl.toString(), {
      signal: options.signal,
      policy: this.policy,
    });
    if (!isJsonContentType(lookup.contentType))
      throw new ExtractionError(
        `unexpected lookup response content type ${lookup.contentType ?? 'missing'}`,
      );
    const results = parseResults(lookup.text);
    const episode = results.find((result) => String(result.trackId) === reference.episodeId);
    const resolved =
      directEpisodeUrl(episode) ?? (await this.resolveFeed(results, episode, options.signal));
    if (!resolved) {
      throw new ExtractionError(
        `no audio enclosure found for Apple Podcasts episode ${reference.episodeId}`,
      );
    }

    return {
      mediaUrl: assertSafeHttpUrl(resolved.mediaUrl, {
        allowPrivateHosts: this.policy?.allowPrivateHosts,
      }).toString(),
      metadata: {
        ...(resolved.title ? { title: resolved.title } : {}),
        resolvedFrom: 'apple',
      },
    };
  }

  private async resolveFeed(
    results: Record<string, unknown>[],
    episode: Record<string, unknown> | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Resolution | undefined> {
    const feedUrl = results.find((result) => typeof result.feedUrl === 'string')?.feedUrl;
    if (typeof feedUrl !== 'string') return undefined;
    const response = await this.fetcher.fetch(feedUrl, { signal, policy: this.policy });
    if (!isFeedContentType(response.contentType)) return undefined;
    const feed = await parseFeed(response.text);
    const episodeGuid = typeof episode?.episodeGuid === 'string' ? episode.episodeGuid : undefined;
    if (!episodeGuid) return undefined;
    const entry = feed.entries.find((candidate) => candidate.id === episodeGuid);
    const mediaUrl = entry?.metadata.enclosureUrl;
    if (typeof mediaUrl !== 'string') return undefined;
    return {
      mediaUrl: new URL(mediaUrl, response.url).toString(),
      title: entry?.title,
    };
  }
}

function parseResults(text: string): Record<string, unknown>[] {
  try {
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== 'object' ||
      !Array.isArray((value as { results?: unknown }).results)
    ) {
      return [];
    }
    return (value as { results: unknown[] }).results.filter(
      (result): result is Record<string, unknown> => Boolean(result) && typeof result === 'object',
    );
  } catch {
    return [];
  }
}

function directEpisodeUrl(result: Record<string, unknown> | undefined): Resolution | undefined {
  if (!result || typeof result.episodeUrl !== 'string') return undefined;
  return {
    mediaUrl: result.episodeUrl,
    title: typeof result.trackName === 'string' ? result.trackName : undefined,
  };
}

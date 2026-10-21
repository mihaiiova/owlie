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
  mediaTypeOf,
} from '@owlieio/core';
import type { PodcastAudioResolver } from './podcast.js';

export interface AppleEpisodeReference {
  country: string;
  podcastId: string;
  episodeId: string;
}

/** An Apple Podcasts show (no episode id) parsed from its URL. */
export interface AppleShowReference {
  country: string;
  podcastId: string;
}

/** The public RSS feed behind an Apple Podcasts show. */
export interface AppleShowFeed {
  feedUrl: string;
  podcastId: string;
  /** Canonical show URL, `https://podcasts.apple.com/<cc>/podcast/id<podcastId>`. */
  showUrl: string;
  title?: string;
}

export interface ApplePodcastsResolverOptions {
  fetcher?: HttpFetcher;
  policy?: HttpFetchPolicy;
}

type Resolution = { mediaUrl: string; title?: string };

/**
 * Parses the shared parts of an Apple Podcasts URL: the two-letter country,
 * the numeric podcast id, and the numeric `i` episode id when present.
 */
function parseApplePodcastUrl(
  input: string,
): { country: string; podcastId: string; episodeId?: string } | undefined {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'podcasts.apple.com') {
      return undefined;
    }
    const podcastId = url.pathname.match(/\/id(\d+)(?:\/|$)/)?.[1];
    const country = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    if (!podcastId || !country || !/^[a-z]{2}$/.test(country)) return undefined;
    const episodeId = url.searchParams.get('i');
    return episodeId && /^\d+$/.test(episodeId)
      ? { country, podcastId, episodeId }
      : { country, podcastId };
  } catch {
    return undefined;
  }
}

/** Parses an Apple Podcasts episode URL without making network requests. */
export function parseAppleEpisodeUrl(input: string): AppleEpisodeReference | undefined {
  const parsed = parseApplePodcastUrl(input);
  if (parsed?.episodeId === undefined) return undefined;
  return { country: parsed.country, podcastId: parsed.podcastId, episodeId: parsed.episodeId };
}

/**
 * Parses an Apple Podcasts show URL (`/<cc>/podcast/<slug?>/id<digits>` with
 * no numeric `i` episode id) without making network requests.
 */
export function parseAppleShowUrl(input: string): AppleShowReference | undefined {
  const parsed = parseApplePodcastUrl(input);
  if (parsed === undefined || parsed.episodeId !== undefined) return undefined;
  return { country: parsed.country, podcastId: parsed.podcastId };
}

/**
 * Resolves an Apple Podcasts show to its public RSS feed through Apple's
 * lookup API (`feedUrl`). The lookup goes through the supplied safe fetcher,
 * so proxy, byte budgets, deadlines and cancellation apply.
 */
export async function resolveAppleShowFeed(
  reference: AppleShowReference,
  options: { fetcher: HttpFetcher; policy?: HttpFetchPolicy; signal?: AbortSignal },
): Promise<AppleShowFeed> {
  if (options.signal?.aborted) throw new CancelledError('Apple Podcasts show lookup cancelled');
  const lookupUrl = new URL('https://itunes.apple.com/lookup');
  lookupUrl.searchParams.set('id', reference.podcastId);
  lookupUrl.searchParams.set('country', reference.country);
  const lookup = await options.fetcher.fetch(lookupUrl.toString(), {
    signal: options.signal,
    policy: options.policy,
  });
  if (!isAppleLookupContentType(lookup.contentType))
    throw new ExtractionError(
      `unexpected lookup response content type ${lookup.contentType ?? 'missing'}`,
    );
  let results: Record<string, unknown>[] | undefined;
  try {
    results = resultsOf(JSON.parse(lookup.text));
  } catch {
    results = undefined;
  }
  if (results === undefined) {
    throw new ExtractionError(
      `invalid Apple Podcasts lookup response for show ${reference.podcastId}`,
    );
  }
  const show = results[0];
  if (show === undefined) {
    throw new ExtractionError(`Apple Podcasts show ${reference.podcastId} was not found`);
  }
  if (typeof show.feedUrl !== 'string' || show.feedUrl.trim() === '') {
    throw new ExtractionError(`Apple Podcasts show ${reference.podcastId} has no public RSS feed`);
  }
  const feedUrl = assertSafeHttpUrl(show.feedUrl.trim(), {
    allowPrivateHosts: options.policy?.allowPrivateHosts,
  }).toString();
  return {
    feedUrl,
    podcastId: reference.podcastId,
    showUrl: `https://podcasts.apple.com/${reference.country}/podcast/id${reference.podcastId}`,
    ...(typeof show.collectionName === 'string' ? { title: show.collectionName } : {}),
  };
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
    if (!isAppleLookupContentType(lookup.contentType))
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

/**
 * Whether a declared media type is a JSON Apple lookup response. Apple's
 * `itunes.apple.com/lookup` endpoint serves JSON with a `text/javascript`
 * (rather than `application/json`) Content-Type, so the lookup gate accepts
 * that well-known Apple media type in addition to standard JSON types.
 */
function isAppleLookupContentType(contentType: string | null | undefined): boolean {
  return isJsonContentType(contentType) || mediaTypeOf(contentType) === 'text/javascript';
}

function parseResults(text: string): Record<string, unknown>[] {
  try {
    return resultsOf(JSON.parse(text)) ?? [];
  } catch {
    return [];
  }
}

/** The object entries of a lookup body's `results` array; `undefined` when it has none. */
function resultsOf(value: unknown): Record<string, unknown>[] | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { results?: unknown }).results)
  )
    return undefined;
  return (value as { results: unknown[] }).results.filter(
    (result): result is Record<string, unknown> => Boolean(result) && typeof result === 'object',
  );
}

function directEpisodeUrl(result: Record<string, unknown> | undefined): Resolution | undefined {
  if (!result || typeof result.episodeUrl !== 'string') return undefined;
  return {
    mediaUrl: result.episodeUrl,
    title: typeof result.trackName === 'string' ? result.trackName : undefined,
  };
}

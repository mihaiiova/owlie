import type { HttpFetcher } from '@owlieio/core';
import { ConfigurationError } from '@owlieio/core';
import type { PodcastAudioResolver } from '@owlieio/adapter-podcast';
import {
  ApplePodcastsResolver,
  DirectMediaResolver,
  GenericEpisodePageResolver,
} from '@owlieio/adapter-podcast';

/** Options passed to each resolver factory. */
export interface ResolverFactoryOptions {
  fetcher: HttpFetcher;
}

/**
 * A named audio resolver registration: a stable name, its CLI selection flag,
 * and a factory that builds the resolver instance. The registry is the sole
 * place a new audio source (for example `podcast-shopify`) is registered — a
 * new source is always a resolver plus a `--<source-type>-<resolver-name>`
 * flag reusing the generic transcription pipeline (ADR 0022).
 */
export interface PodcastResolverRegistration {
  name: string;
  flag: string;
  create(options: ResolverFactoryOptions): PodcastAudioResolver;
}

/**
 * The podcast resolver registry in recognition order (specific resolvers
 * first, generic fallback last). Each entry maps a resolver name to both its
 * implementation factory and its CLI flag.
 */
export const PODCAST_RESOLVER_REGISTRY: readonly PodcastResolverRegistration[] = [
  {
    name: 'podcast-media',
    flag: '--podcast-media',
    create: () => new DirectMediaResolver(),
  },
  {
    name: 'podcast-apple',
    flag: '--podcast-apple',
    create: ({ fetcher }) => new ApplePodcastsResolver({ fetcher }),
  },
  {
    name: 'podcast-page',
    flag: '--podcast-page',
    create: ({ fetcher }) => new GenericEpisodePageResolver({ fetcher }),
  },
];

/** Every resolver selection flag, in recognition order. */
export function resolverFlags(): readonly string[] {
  return PODCAST_RESOLVER_REGISTRY.map((entry) => entry.flag);
}

/** Maps a resolver selection flag to its stable resolver name, or `undefined`. */
export function resolverNameForFlag(flag: string): string | undefined {
  return PODCAST_RESOLVER_REGISTRY.find((entry) => entry.flag === flag)?.name;
}

/** Maps a stable resolver name to its selection flag, or `undefined`. */
export function resolverFlagForName(name: string): string | undefined {
  return PODCAST_RESOLVER_REGISTRY.find((entry) => entry.name === name)?.flag;
}

/** Builds the ordered resolver instances used by automatic dispatch. */
export function createPodcastResolvers(fetcher: HttpFetcher): readonly PodcastAudioResolver[] {
  return PODCAST_RESOLVER_REGISTRY.map((entry) => entry.create({ fetcher }));
}

/** A validated media URL plus its source metadata, resolved without download or transcription. */
export interface ResolvedAudio {
  /** The stable name of the resolver that produced the media URL. */
  resolver: string;
  mediaUrl: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvePodcastAudioOptions {
  fetcher: HttpFetcher;
  registry?: readonly PodcastResolverRegistration[];
  /** When set, only this resolver runs (authoritative selection). */
  resolverName?: string;
  signal?: AbortSignal;
}

/**
 * Resolves a URL to a validated media URL through the podcast resolvers. With
 * a `resolverName`, only that resolver runs; without one, resolvers run in
 * registration order and the first recognizing resolver wins. Resolution never
 * downloads or transcribes media. Throws {@link ConfigurationError} when the
 * requested resolver is unknown or no resolver recognizes the URL.
 */
export async function resolvePodcastAudio(
  url: string,
  options: ResolvePodcastAudioOptions,
): Promise<ResolvedAudio> {
  const registry = options.registry ?? PODCAST_RESOLVER_REGISTRY;
  const fetcher = options.fetcher;

  let entries: readonly PodcastResolverRegistration[];
  if (options.resolverName !== undefined) {
    const entry = registry.find((candidate) => candidate.name === options.resolverName);
    if (!entry) {
      throw new ConfigurationError(`unknown resolver "${options.resolverName}"`);
    }
    entries = [entry];
  } else {
    entries = registry;
  }

  for (const entry of entries) {
    const resolver = entry.create({ fetcher });
    if (!resolver.recognize({ url })) continue;
    const resolved = await resolver.resolve({ url }, { signal: options.signal });
    return { resolver: entry.name, mediaUrl: resolved.mediaUrl, metadata: resolved.metadata };
  }

  if (options.resolverName !== undefined) {
    const entry = entries[0];
    throw new ConfigurationError(
      `resolver "${entry?.flag ?? options.resolverName}" does not recognize URL: ${url}`,
    );
  }
  throw new ConfigurationError(`no podcast resolver recognizes URL: ${url}`);
}

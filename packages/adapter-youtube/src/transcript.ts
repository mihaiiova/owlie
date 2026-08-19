import {
  GenericProxyConfig,
  RequestBlocked,
  WebshareProxyConfig,
  YouTubeTranscriptApi,
} from '@hallelx/youtube-transcript';
import { CancelledError, CaptionsUnavailableError, ExtractionError } from '@owlieio/core';

export const DEFAULT_LANGUAGES: readonly string[] = ['en'];
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Minimal caption-track shape used by the pure selection logic. */
export interface TranscriptTrack {
  languageCode: string;
  language?: string;
  isGenerated: boolean;
}

/** A caption track that can also be fetched (matches the library's `Transcript`). */
export interface FetchedTrack extends TranscriptTrack {
  fetch(): Promise<{ snippets: { text: string }[] }>;
}

/** Normalized result of a successful transcript fetch. */
export interface TranscriptPayload {
  videoId: string;
  transcript: string;
  language: string;
  languageCode: string;
  isGenerated: boolean;
}

/** Seam for fetching a video transcript (injected for offline tests). */
export interface TranscriptClient {
  fetch(
    videoId: string,
    options?: { languages?: string[]; signal?: AbortSignal; timeoutMs?: number },
  ): Promise<TranscriptPayload>;
}

/** Seam for listing a video's caption tracks (injected for offline tests). */
export interface TranscriptSource {
  list(videoId: string, signal?: AbortSignal): Promise<FetchedTrack[]>;
}

/** Provider-neutral proxy configuration for transcript fetching. */
export type TranscriptProxy =
  { type: 'webshare'; username: string; password: string } | { type: 'generic'; url: string };

/** Maps a provider-neutral proxy shape to the transcript library's config. */
export function toProxyConfig(
  proxy?: TranscriptProxy,
): WebshareProxyConfig | GenericProxyConfig | undefined {
  if (!proxy) return undefined;
  if (proxy.type === 'webshare') {
    return new WebshareProxyConfig({
      proxyUsername: proxy.username,
      proxyPassword: proxy.password,
    });
  }
  return new GenericProxyConfig({ httpUrl: proxy.url });
}

function matchesLanguage(track: TranscriptTrack, language: string): boolean {
  const code = track.languageCode.toLowerCase();
  const want = language.toLowerCase();
  return code === want || code.startsWith(`${want}-`);
}

/**
 * Selects a transcript using the documented policy: manually created tracks
 * matching the requested languages (in priority order), then generated tracks
 * matching those languages, then the first manual track, then the first
 * generated track. Never translates.
 */
export function pickTranscript<T extends TranscriptTrack>(
  tracks: readonly T[],
  languages: readonly string[],
): T | null {
  const manual = tracks.filter((t) => !t.isGenerated);
  const generated = tracks.filter((t) => t.isGenerated);

  for (const language of languages) {
    const found = manual.find((t) => matchesLanguage(t, language));
    if (found) return found;
  }
  for (const language of languages) {
    const found = generated.find((t) => matchesLanguage(t, language));
    if (found) return found;
  }
  return manual[0] ?? generated[0] ?? null;
}

function combineAbort(signal?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  if (signal === undefined && timeoutMs === undefined) return undefined;
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  if (timeoutMs !== undefined) signals.push(AbortSignal.timeout(timeoutMs));
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * Options passed to the transcript library's client. The library ignores
 * `proxyConfig` when a `fetchFn` is present, so the two are mutually exclusive:
 * a proxy takes precedence, and the abort signal is honored by the caller.
 */
export function transcriptApiOptions(
  proxy: TranscriptProxy | undefined,
  fetchFn: typeof fetch | undefined,
  signal: AbortSignal | undefined,
): { proxyConfig?: WebshareProxyConfig | GenericProxyConfig; fetchFn?: typeof fetch } {
  const proxyConfig = toProxyConfig(proxy);
  if (proxyConfig) {
    return { proxyConfig };
  }
  const baseFetch = fetchFn ?? globalThis.fetch;
  return { fetchFn: (input, init) => baseFetch(input, { ...init, signal }) };
}

/** Real transcript source backed by `@hallelx/youtube-transcript`. */
export class LibraryTranscriptSource implements TranscriptSource {
  constructor(private readonly options: { fetchFn?: typeof fetch; proxy?: TranscriptProxy } = {}) {}

  async list(videoId: string, signal?: AbortSignal): Promise<FetchedTrack[]> {
    const api = new YouTubeTranscriptApi(
      transcriptApiOptions(this.options.proxy, this.options.fetchFn, signal),
    );
    const promise = api.list(videoId).then((list) => [...list]);
    if (!signal) return promise;

    // Honor cancellation/timeout for the proxy path (where no fetchFn is used).
    return new Promise<FetchedTrack[]>((resolve, reject) => {
      if (signal.aborted) {
        reject(new CancelledError('transcript extraction was cancelled'));
        return;
      }
      const onAbort = () => reject(new CancelledError('transcript extraction was cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }
}

/** Default `TranscriptClient` using the pure-JS YouTube transcript library. */
export class YouTubeTranscriptClient implements TranscriptClient {
  private readonly source: TranscriptSource;
  private readonly languages: readonly string[];

  constructor(
    options: {
      languages?: readonly string[];
      source?: TranscriptSource;
      proxy?: TranscriptProxy;
    } = {},
  ) {
    this.source = options.source ?? new LibraryTranscriptSource({ proxy: options.proxy });
    this.languages = options.languages ?? DEFAULT_LANGUAGES;
  }

  async fetch(
    videoId: string,
    options: { languages?: string[]; signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<TranscriptPayload> {
    const signal = combineAbort(options.signal, options.timeoutMs);
    try {
      const tracks = await this.source.list(videoId, signal);
      const track = pickTranscript(tracks, options.languages ?? this.languages);
      if (!track) {
        throw new CaptionsUnavailableError('No YouTube transcripts are available for this video');
      }
      const fetched = await track.fetch();
      const text = fetched.snippets
        .map((snippet) => snippet.text)
        .join(' ')
        .trim();
      if (!text) {
        throw new CaptionsUnavailableError('YouTube transcript is empty');
      }
      return {
        videoId,
        transcript: text,
        language: track.language ?? '',
        languageCode: track.languageCode,
        isGenerated: track.isGenerated,
      };
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new CancelledError('transcript extraction was cancelled', { cause: error });
      }
      if (error instanceof CaptionsUnavailableError || error instanceof CancelledError) {
        throw error;
      }
      if (error instanceof RequestBlocked) {
        throw new ExtractionError(
          'YouTube blocked the transcript request (this network IP is likely blocked). ' +
            'Configure a proxy by running `owlie setup`.',
          { cause: error },
        );
      }
      throw new ExtractionError(
        `failed to fetch YouTube transcript: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

/** Options accepted by the {@link YouTubeAdapter} constructor. */
export interface YouTubeAdapterOptions {
  client?: TranscriptClient;
  languages?: readonly string[];
  proxy?: TranscriptProxy;
  timeoutMs?: number;
}

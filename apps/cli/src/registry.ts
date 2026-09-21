import type {
  ContentProcessor,
  HttpFetchPolicy,
  ItemAdapter,
  ProviderCatalog,
} from '@owlieio/core';
import { ConfigurationError, DefaultHttpFetcher } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { PodcastAdapter } from '@owlieio/adapter-podcast';
import { WhisperLocalTranscriber } from '@owlieio/provider-whisper';
import { RssAdapter } from '@owlieio/adapter-rss';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import type { TranscriptProxy } from '@owlieio/adapter-youtube';
import { DeepSeekProcessor, DeepSeekCatalog, DEEPSEEK_BASE_URL } from '@owlieio/provider-deepseek';
import { OpenAIProcessor, OpenAICatalog, OPENAI_BASE_URL } from '@owlieio/provider-openai';
import { createPodcastResolvers } from './resolvers.js';

/**
 * The functional adapters bundled into `owlie`: the YouTube video item
 * adapter, the direct-media podcast item adapter, the static article item
 * adapter (universal `extract` dispatch), and the RSS/Atom collection adapter
 * (bounded `list` and feed extraction). Reddit remains a deferred scaffold
 * and is deliberately not registered.
 */
export const ADAPTER_IDS: readonly string[] = [
  YouTubeAdapter.id,
  PodcastAdapter.id,
  RssAdapter.id,
  ArticleAdapter.id,
];

/**
 * The default ordered item adapters for universal `extract` dispatch: the
 * specialized YouTube adapter first, then podcast media and declarative
 * episode pages, then the article fallback for any remaining safe HTTP(S)
 * URL. The CLI passes explicit language/proxy/transcription configuration.
 */
export function defaultItemAdapters(
  options: {
    languages?: string[];
    proxy?: TranscriptProxy;
    cacheDir?: string;
    whisperModel?: string;
    mediaMaxBytes?: number;
    networkPolicy?: HttpFetchPolicy;
  } = {},
): ItemAdapter[] {
  const podcastFetcher = new DefaultHttpFetcher();
  return [
    new YouTubeAdapter({ languages: options.languages, proxy: options.proxy }),
    new PodcastAdapter({
      fetcher: podcastFetcher,
      transcriber: new WhisperLocalTranscriber({ model: options.whisperModel }),
      cacheDir: options.cacheDir ?? '.owlie-cache',
      mediaFetchPolicy: {
        ...(options.networkPolicy ?? {}),
        ...(options.mediaMaxBytes === undefined ? {} : { maxResponseBytes: options.mediaMaxBytes }),
      },
      resolvers: createPodcastResolvers(podcastFetcher, options.networkPolicy),
    }),
    new ArticleAdapter({ policy: options.networkPolicy }),
  ];
}

/** Explicit configuration passed to a processor (loaded only by the CLI). */
export interface ProcessorConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface ProcessorRegistration {
  id: string;
  /** Default base URL for authenticated live model discovery (`GET /models`). */
  baseUrl: string;
  /** Provider-neutral live model catalog for `owlie models` discovery. */
  catalog: ProviderCatalog;
  createProcessor(config: ProcessorConfig & { model: string }): ContentProcessor;
}

/**
 * Public description of a functional provider (used by `owlie setup`). The
 * model list is discovered live from the provider's authenticated `/models`
 * endpoint during setup, so it is not part of the static registration.
 */
export interface ProviderInfo {
  id: string;
  baseUrl: string;
}

/**
 * Provider → processor registry. Selection is explicit: the CLI resolves a
 * model reference (`provider/model-id` compound, or a plain model id with a
 * separately resolved provider) and then resolves a model within that
 * provider. A compound model reference implies its provider.
 */
const PROCESSOR_REGISTRY: readonly ProcessorRegistration[] = [
  {
    id: DeepSeekProcessor.id,
    baseUrl: DEEPSEEK_BASE_URL,
    catalog: new DeepSeekCatalog(),
    createProcessor: (config) => new DeepSeekProcessor(config),
  },
  {
    id: OpenAIProcessor.id,
    baseUrl: OPENAI_BASE_URL,
    catalog: new OpenAICatalog(),
    createProcessor: (config) => new OpenAIProcessor(config),
  },
];

/** Provider ids that are actually functional (used by `doctor`). */
export const PROVIDER_IDS: readonly string[] = PROCESSOR_REGISTRY.map((provider) => provider.id);

/** Lists the functional providers and their default model-discovery base URL. */
export function listProviders(): ProviderInfo[] {
  return PROCESSOR_REGISTRY.map((provider) => ({ id: provider.id, baseUrl: provider.baseUrl }));
}

/** Throws {@link ConfigurationError} when the provider id is not registered. */
export function assertKnownProvider(provider: string): void {
  if (!PROCESSOR_REGISTRY.some((entry) => entry.id === provider)) {
    throw new ConfigurationError(
      `unknown provider "${provider}" (known providers: ${PROVIDER_IDS.join(', ')})`,
    );
  }
}

/**
 * Resolves the processor for an explicitly selected provider and model.
 * Throws {@link ConfigurationError} when the provider is absent/unknown or the
 * model is absent. Unknown model ids are passed through to the provider (the
 * live model list is dynamic), which validates them at call time.
 */
export function resolveProcessor(
  provider: string | undefined,
  model: string | undefined,
  config: ProcessorConfig,
): ContentProcessor {
  if (provider === undefined || provider.trim() === '') {
    throw new ConfigurationError(
      'no provider selected: pass --provider <provider> or set OWLIE_PROVIDER',
    );
  }
  assertKnownProvider(provider);
  if (model === undefined || model.trim() === '') {
    throw new ConfigurationError(
      `no model selected for provider "${provider}": pass --model <model>`,
    );
  }
  const registration = PROCESSOR_REGISTRY.find((entry) => entry.id === provider);
  return registration!.createProcessor({ ...config, model });
}

/** A parsed `--model` reference: either compound (`provider/model-id`) or plain (`model-id`). */
export interface ModelReference {
  provider?: string;
  model: string;
}

/**
 * Parses a `--model` value into a {@link ModelReference}. `provider/model-id`
 * yields both parts; a value with no slash yields a plain model id with no
 * implied provider. Pure and total: malformed compound forms (a missing
 * provider or model part) fall back to a plain reference and are rejected
 * downstream by the provider-selection logic.
 */
export function resolveModelReference(model: string): ModelReference {
  const value = model.trim();
  const slash = value.indexOf('/');
  if (slash > 0) {
    const provider = value.slice(0, slash).trim();
    const id = value.slice(slash + 1).trim();
    if (provider && id) return { provider, model: id };
  }
  return { model: value };
}

/** Resolves a registered provider's live model catalog. */
export function getProviderCatalog(provider: string): ProviderCatalog {
  assertKnownProvider(provider);
  return PROCESSOR_REGISTRY.find((entry) => entry.id === provider)!.catalog;
}

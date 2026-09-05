import type { ContentProcessor, ItemAdapter } from '@owlieio/core';
import { ConfigurationError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { RssAdapter } from '@owlieio/adapter-rss';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import type { TranscriptProxy } from '@owlieio/adapter-youtube';
import { DeepSeekProcessor } from '@owlieio/provider-deepseek';
import { OpenAIProcessor } from '@owlieio/provider-openai';

/**
 * The functional adapters bundled into `owlie`: the YouTube video item
 * adapter, the static article item adapter (universal `extract` dispatch),
 * and the RSS/Atom collection adapter (bounded `list` and feed extraction).
 * Podcast and Reddit remain deferred scaffolds and are deliberately not
 * registered.
 */
export const ADAPTER_IDS: readonly string[] = [YouTubeAdapter.id, RssAdapter.id, ArticleAdapter.id];

/**
 * The default ordered item adapters for universal `extract` dispatch: the
 * specialized YouTube adapter first, then the article fallback for any other
 * safe HTTP(S) URL. The CLI passes explicit language/proxy configuration.
 */
export function defaultItemAdapters(
  options: { languages?: string[]; proxy?: TranscriptProxy } = {},
): ItemAdapter[] {
  return [
    new YouTubeAdapter({ languages: options.languages, proxy: options.proxy }),
    new ArticleAdapter(),
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
  create(config: ProcessorConfig & { model: string }): ContentProcessor;
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
 * Provider → processor registry. Selection is explicit and provider-first:
 * the CLI resolves a provider id (flag → `OWLIE_PROVIDER` → saved active
 * provider) and then resolves a model within that provider. A model id never
 * implies a provider.
 */
const PROCESSOR_REGISTRY: readonly ProcessorRegistration[] = [
  {
    id: DeepSeekProcessor.id,
    baseUrl: 'https://api.deepseek.com',
    create: (config) => new DeepSeekProcessor(config),
  },
  {
    id: OpenAIProcessor.id,
    baseUrl: 'https://api.openai.com/v1',
    create: (config) => new OpenAIProcessor(config),
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
  return registration!.create({ ...config, model });
}

import type { ContentProcessor } from '@owlieio/core';
import { ConfigurationError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { RssAdapter } from '@owlieio/adapter-rss';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import { DeepSeekProcessor } from '@owlieio/provider-deepseek';

/**
 * The functional adapters bundled into `owlie`: the YouTube video item
 * adapter, the static article item adapter (universal `extract` dispatch),
 * and the RSS/Atom collection adapter (bounded `list` and feed extraction).
 * Podcast and Reddit remain deferred scaffolds and are deliberately not
 * registered.
 */
export const ADAPTER_IDS: readonly string[] = [YouTubeAdapter.id, RssAdapter.id, ArticleAdapter.id];

/** Explicit configuration passed to a processor (loaded only by the CLI). */
export interface ProcessorConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface ProcessorRegistration {
  id: string;
  models: readonly string[];
  create(config: ProcessorConfig & { model: string }): ContentProcessor;
}

/** Public description of a functional provider (used by `owlie setup`). */
export interface ProviderInfo {
  id: string;
  models: readonly string[];
}

/**
 * Model → processor registry. v0.1 registers only DeepSeek; additional
 * providers are added here as they are implemented.
 */
const PROCESSOR_REGISTRY: readonly ProcessorRegistration[] = [
  {
    id: DeepSeekProcessor.id,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    create: (config) => new DeepSeekProcessor(config),
  },
];

/** Provider ids that are actually functional (used by `doctor`). */
export const PROVIDER_IDS: readonly string[] = PROCESSOR_REGISTRY.map((provider) => provider.id);

/** Lists the functional providers and their known (fallback) models. */
export function listProviders(): ProviderInfo[] {
  return PROCESSOR_REGISTRY.map((provider) => ({ id: provider.id, models: provider.models }));
}

/**
 * Resolves the processor for a selected model. Throws {@link ConfigurationError}
 * when no model is selected. The model id itself is accepted leniently (the
 * live model list is dynamic), so unknown models are passed through to the
 * provider and validated there.
 */
export function resolveProcessor(
  model: string | undefined,
  config: ProcessorConfig,
): ContentProcessor {
  if (model === undefined || model.trim() === '') {
    throw new ConfigurationError(
      'no model selected: pass --model <model> (e.g. --model deepseek-chat)',
    );
  }
  const registration =
    PROCESSOR_REGISTRY.find((provider) => provider.models.includes(model)) ?? PROCESSOR_REGISTRY[0];
  if (!registration) {
    throw new ConfigurationError('no LLM providers are registered');
  }
  return registration.create({ ...config, model });
}

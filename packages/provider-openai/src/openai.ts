import type {
  ContentProcessor,
  ProcessRequest,
  ProcessResult,
  ProcessorOptions,
} from '@owlieio/core';
import { ConfigurationError, NotImplementedError } from '@owlieio/core';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/** Validates provider configuration. Never loads environment variables. */
export function validateOpenAIConfig(config: OpenAIConfig): OpenAIConfig {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new ConfigurationError('OpenAI provider requires an apiKey');
  }
  return config;
}

/**
 * OpenAI content processor. This scaffold defines the surface and config but
 * never makes network calls; `process` throws {@link NotImplementedError}.
 */
export class OpenAIProcessor implements ContentProcessor {
  static readonly id = 'openai';
  readonly id = OpenAIProcessor.id;
  readonly config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = validateOpenAIConfig(config);
  }

  async process(_request: ProcessRequest, _options?: ProcessorOptions): Promise<ProcessResult> {
    throw new NotImplementedError('OpenAI processing is not implemented yet');
  }
}

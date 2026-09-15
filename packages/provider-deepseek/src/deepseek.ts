import type {
  ContentProcessor,
  ProcessRequest,
  ProcessResult,
  ProcessorOptions,
} from '@owlieio/core';
import {
  buildProcessResult,
  ConfigurationError,
  mapProcessingError,
  renderPrompt,
} from '@owlieio/core';
import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';

/** The documented default DeepSeek chat model. */
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/** Validates provider configuration. Never reads environment variables. */
export function validateDeepSeekConfig(config: DeepSeekConfig): DeepSeekConfig {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new ConfigurationError('DeepSeek provider requires an apiKey');
  }
  return config;
}

export interface DeepSeekGenerateParams {
  model: string;
  prompt: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface DeepSeekGenerateResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/** Seam for invoking the model (injected for offline tests). */
export interface DeepSeekClient {
  generate(params: DeepSeekGenerateParams): Promise<DeepSeekGenerateResult>;
}

/** Builds the real client on top of `ai` + `@ai-sdk/deepseek`. */
export function createDefaultDeepSeekClient(config: DeepSeekConfig): DeepSeekClient {
  const provider = createDeepSeek({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
  return {
    async generate({ model, prompt, abortSignal, timeoutMs }) {
      const result = await generateText({
        model: provider(model),
        prompt,
        abortSignal,
        ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
      });
      return {
        text: result.text,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        },
      };
    },
  };
}

/**
 * DeepSeek content processor. Implements the provider-neutral
 * {@link ContentProcessor} contract; configuration is an explicit object and
 * the API key is never logged or serialized.
 */
export class DeepSeekProcessor implements ContentProcessor {
  static readonly id = 'deepseek';
  readonly id = DeepSeekProcessor.id;
  readonly config: DeepSeekConfig;
  private readonly client: DeepSeekClient;

  constructor(config: DeepSeekConfig, options: { client?: DeepSeekClient } = {}) {
    this.config = validateDeepSeekConfig(config);
    this.client = options.client ?? createDefaultDeepSeekClient(this.config);
  }

  async process(request: ProcessRequest, options: ProcessorOptions = {}): Promise<ProcessResult> {
    const model = this.config.model ?? DEFAULT_DEEPSEEK_MODEL;
    try {
      const result = await this.client.generate({
        model,
        prompt: renderPrompt(request),
        abortSignal: options.signal,
        timeoutMs: this.config.timeoutMs,
      });

      return buildProcessResult({
        output: result.text,
        provider: this.id,
        model,
        usage: result.usage,
        outputSchema: request.outputSchema,
      });
    } catch (error) {
      mapProcessingError('DeepSeek', error, options.signal);
    }
  }
}

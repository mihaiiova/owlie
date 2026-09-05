import type {
  ContentProcessor,
  ProcessRequest,
  ProcessResult,
  ProcessorOptions,
} from '@owlieio/core';
import { CancelledError, ConfigurationError, ProcessingError } from '@owlieio/core';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/** Validates provider configuration. Never reads environment variables. */
export function validateOpenAIConfig(config: OpenAIConfig): OpenAIConfig {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new ConfigurationError('OpenAI provider requires an apiKey');
  }
  return config;
}

export interface OpenAIGenerateParams {
  model: string;
  prompt: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface OpenAIGenerateResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/** Seam for invoking the model (injected for offline tests). */
export interface OpenAIClient {
  generate(params: OpenAIGenerateParams): Promise<OpenAIGenerateResult>;
}

/** Builds the real client on top of `ai` + `@ai-sdk/openai`. */
export function createDefaultOpenAIClient(config: OpenAIConfig): OpenAIClient {
  const provider = createOpenAI({
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

function buildPrompt(request: ProcessRequest): string {
  const parts: string[] = [];
  const instruction = request.instruction?.trim();
  if (instruction) parts.push(instruction);
  if (request.outputSchema) {
    parts.push(
      'Respond with JSON that matches this schema: ' + JSON.stringify(request.outputSchema),
    );
  }
  parts.push(request.document.text.trim());
  return parts.join('\n\n').trim();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * OpenAI content processor. Implements the provider-neutral
 * {@link ContentProcessor} contract; configuration is an explicit object and
 * the API key is never logged or serialized. There is no default model: the
 * model selected by setup, environment, or `--model` is required.
 */
export class OpenAIProcessor implements ContentProcessor {
  static readonly id = 'openai';
  readonly id = OpenAIProcessor.id;
  readonly config: OpenAIConfig;
  private readonly client: OpenAIClient;

  constructor(config: OpenAIConfig, options: { client?: OpenAIClient } = {}) {
    this.config = validateOpenAIConfig(config);
    this.client = options.client ?? createDefaultOpenAIClient(this.config);
  }

  async process(request: ProcessRequest, options: ProcessorOptions = {}): Promise<ProcessResult> {
    const model = this.config.model?.trim();
    if (!model) {
      throw new ConfigurationError('no OpenAI model selected: pass --model <model>');
    }
    try {
      const result = await this.client.generate({
        model,
        prompt: buildPrompt(request),
        abortSignal: options.signal,
        timeoutMs: this.config.timeoutMs,
      });

      const metadata: Record<string, unknown> = { provider: this.id, model };
      if (result.usage) {
        metadata.usage = {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        };
      }

      return {
        output: result.text,
        format: request.outputSchema ? 'json' : 'text',
        metadata,
      };
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        throw new CancelledError('OpenAI processing was cancelled', { cause: error });
      }
      throw new ProcessingError(
        `OpenAI processing failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

import { describe, expect, it } from 'vitest';
import type { NormalizedDocument } from '@owlieio/core';
import { CancelledError, ConfigurationError, ProcessingError } from '@owlieio/core';
import { OpenAIProcessor } from '@owlieio/provider-openai';
import type {
  OpenAIClient,
  OpenAIGenerateParams,
  OpenAIGenerateResult,
} from '@owlieio/provider-openai';

const document: NormalizedDocument = {
  schemaVersion: 1,
  id: 'test:doc',
  sourceType: 'youtube',
  canonicalUrl: 'https://example.com',
  mediaType: 'transcript',
  text: 'hello world',
  metadata: {},
};

function makeClient(
  behavior: {
    text?: string;
    error?: unknown;
    usage?: OpenAIGenerateResult['usage'];
  } = {},
) {
  const calls: OpenAIGenerateParams[] = [];
  const client: OpenAIClient = {
    async generate(params) {
      calls.push(params);
      if (behavior.error) throw behavior.error;
      return {
        text: behavior.text ?? 'summary',
        usage: behavior.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    },
  };
  return { client, calls };
}

describe('OpenAIProcessor.process', () => {
  it('returns a text ProcessResult with provider/model metadata and normalized usage', async () => {
    const { client } = makeClient({ text: 'summary' });
    const processor = new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client });
    const result = await processor.process({ document, instruction: 'Summarize this' });
    expect(result.format).toBe('text');
    expect(result.output).toBe('summary');
    expect(result.metadata.provider).toBe('openai');
    expect(result.metadata.model).toBe('gpt-4o-mini');
    expect(result.metadata.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it('includes the instruction and document text in the prompt', async () => {
    const { client, calls } = makeClient();
    const processor = new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client });
    await processor.process({ document, instruction: 'Summarize this' });
    expect(calls[0]?.prompt).toContain('Summarize this');
    expect(calls[0]?.prompt).toContain('hello world');
  });

  it('requires a model and rejects with a configuration error when missing', async () => {
    const { client } = makeClient();
    const processor = new OpenAIProcessor({ apiKey: 'sk-test' }, { client });
    await expect(processor.process({ document })).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('returns JSON format when an output schema is provided', async () => {
    const { client } = makeClient({ text: '{"summary":"x"}' });
    const processor = new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client });
    const result = await processor.process({ document, outputSchema: { type: 'object' } });
    expect(result.format).toBe('json');
  });

  it('forwards the configured timeout to the client', async () => {
    const { client, calls } = makeClient();
    const processor = new OpenAIProcessor(
      { apiKey: 'sk-test', model: 'gpt-4o-mini', timeoutMs: 5000 },
      { client },
    );
    await processor.process({ document });
    expect(calls[0]?.timeoutMs).toBe(5000);
  });

  it('forwards the abort signal to the client', async () => {
    const { client, calls } = makeClient();
    const processor = new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client });
    const controller = new AbortController();
    await processor.process({ document }, { signal: controller.signal });
    expect(calls[0]?.abortSignal).toBe(controller.signal);
  });

  it('maps SDK failures to ProcessingError', async () => {
    const { client } = makeClient({ error: new Error('boom') });
    const processor = new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client });
    await expect(processor.process({ document })).rejects.toBeInstanceOf(ProcessingError);
  });

  it('maps an aborted signal to CancelledError', async () => {
    const { client } = makeClient({ error: new Error('aborted') });
    const processor = new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client });
    const controller = new AbortController();
    controller.abort();
    await expect(
      processor.process({ document }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it('never serializes the api key', async () => {
    const { client } = makeClient();
    const processor = new OpenAIProcessor(
      { apiKey: 'sk-secret', model: 'gpt-4o-mini' },
      { client },
    );
    const result = await processor.process({ document });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });
});

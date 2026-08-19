import { describe, expect, it } from 'vitest';
import type { NormalizedDocument } from '@owlieio/core';
import { CancelledError, ProcessingError } from '@owlieio/core';
import { DeepSeekProcessor } from '@owlieio/provider-deepseek';
import type {
  DeepSeekClient,
  DeepSeekGenerateParams,
  DeepSeekGenerateResult,
} from '@owlieio/provider-deepseek';

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
    usage?: DeepSeekGenerateResult['usage'];
  } = {},
) {
  const calls: DeepSeekGenerateParams[] = [];
  const client: DeepSeekClient = {
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

describe('DeepSeekProcessor.process', () => {
  it('returns a text ProcessResult with non-secret usage metadata', async () => {
    const { client } = makeClient({ text: 'summary' });
    const processor = new DeepSeekProcessor(
      { apiKey: 'sk-test', model: 'deepseek-chat' },
      { client },
    );
    const result = await processor.process({ document, instruction: 'Summarize this' });
    expect(result.format).toBe('text');
    expect(result.output).toBe('summary');
    expect(result.metadata.model).toBe('deepseek-chat');
    expect(result.metadata.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it('includes the instruction and document text in the prompt', async () => {
    const { client, calls } = makeClient();
    const processor = new DeepSeekProcessor({ apiKey: 'sk-test' }, { client });
    await processor.process({ document, instruction: 'Summarize this' });
    expect(calls[0]?.prompt).toContain('Summarize this');
    expect(calls[0]?.prompt).toContain('hello world');
  });

  it('uses the default model when none is configured', async () => {
    const { client, calls } = makeClient();
    const processor = new DeepSeekProcessor({ apiKey: 'sk-test' }, { client });
    await processor.process({ document });
    expect(calls[0]?.model).toBe('deepseek-chat');
  });

  it('returns JSON format when an output schema is provided', async () => {
    const { client } = makeClient({ text: '{"summary":"x"}' });
    const processor = new DeepSeekProcessor({ apiKey: 'sk-test' }, { client });
    const result = await processor.process({ document, outputSchema: { type: 'object' } });
    expect(result.format).toBe('json');
  });

  it('maps SDK failures to ProcessingError', async () => {
    const { client } = makeClient({ error: new Error('boom') });
    const processor = new DeepSeekProcessor({ apiKey: 'sk-test' }, { client });
    await expect(processor.process({ document })).rejects.toBeInstanceOf(ProcessingError);
  });

  it('maps an aborted signal to CancelledError', async () => {
    const { client } = makeClient({ error: new Error('aborted') });
    const processor = new DeepSeekProcessor({ apiKey: 'sk-test' }, { client });
    const controller = new AbortController();
    controller.abort();
    await expect(
      processor.process({ document }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it('never serializes the api key', async () => {
    const { client } = makeClient();
    const processor = new DeepSeekProcessor({ apiKey: 'sk-secret' }, { client });
    const result = await processor.process({ document });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });
});

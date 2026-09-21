import { describe, expect, it } from 'vitest';
import type { NormalizedDocument, ProcessRequest } from '@owlieio/core';
import {
  buildProcessResult,
  buildProvenance,
  CancelledError,
  isAbortError,
  mapProcessingError,
  normalizeUsage,
  ProcessingError,
  redactSecrets,
  renderPrompt,
} from '@owlieio/core';

const document: NormalizedDocument = {
  schemaVersion: 2,
  id: 'test:doc',
  sourceType: 'article',
  canonicalUrl: 'https://example.com/article',
  mediaType: 'text',
  text: '  hello world  ',
  metadata: {},
  provenance: buildProvenance({
    sourceId: 'test:doc',
    canonicalUrl: 'https://example.com/article',
    adapterId: 'article',
    text: '  hello world  ',
    fetchedAt: '2026-09-21T00:00:00.000Z',
  }),
};

describe('renderPrompt', () => {
  it('joins the instruction, JSON schema directive, and document text', () => {
    const request: ProcessRequest = {
      document,
      instruction: 'Summarize this',
      outputSchema: { type: 'object' },
    };
    const prompt = renderPrompt(request);
    expect(prompt).toContain('Summarize this');
    expect(prompt).toContain('Respond with JSON that matches this schema: {"type":"object"}');
    expect(prompt).toContain('hello world');
    expect(prompt).toBe(
      'Summarize this\n\nRespond with JSON that matches this schema: {"type":"object"}\n\nhello world',
    );
  });

  it('omits blank instructions and unused schema directives', () => {
    const prompt = renderPrompt({ document, instruction: '   ' });
    expect(prompt).toBe('hello world');
  });

  it('trims the document text and leaves no leading/trailing whitespace', () => {
    const prompt = renderPrompt({ document });
    expect(prompt).toBe('hello world');
    expect(prompt).not.toMatch(/^\s|\s$/);
  });
});

describe('normalizeUsage', () => {
  it('returns undefined when no usage is supplied', () => {
    expect(normalizeUsage(undefined)).toBeUndefined();
  });

  it('copies only the three provider-neutral token fields', () => {
    const sdkUsage = { inputTokens: 12, outputTokens: 7, totalTokens: 19, promptTokens: 4 };
    const usage = normalizeUsage(sdkUsage);
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 7, totalTokens: 19 });
  });
});

describe('buildProcessResult', () => {
  it('builds a text result with provider/model metadata', () => {
    const result = buildProcessResult({
      output: 'summary',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(result).toEqual({
      output: 'summary',
      format: 'text',
      metadata: { provider: 'openai', model: 'gpt-4o-mini' },
    });
  });

  it('selects the JSON format when an output schema is present', () => {
    const result = buildProcessResult({
      output: '{"x":1}',
      provider: 'deepseek',
      model: 'deepseek-chat',
      outputSchema: { type: 'object' },
    });
    expect(result.format).toBe('json');
  });

  it('normalizes and includes usage when supplied', () => {
    const result = buildProcessResult({
      output: 'summary',
      provider: 'openai',
      model: 'gpt-4o-mini',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    expect(result.metadata.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('omits usage metadata when none is supplied', () => {
    const result = buildProcessResult({
      output: 'summary',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(result.metadata.usage).toBeUndefined();
  });
});

describe('isAbortError', () => {
  it('recognizes AbortError and rejects other errors', () => {
    expect(isAbortError(new Error('aborted'))).toBe(false);
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError('aborted')).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('replaces exact secret values', () => {
    expect(redactSecrets('Authorization: Bearer sk-abc', ['sk-abc'])).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it('redacts bearer tokens even when the exact secret is unknown', () => {
    expect(redactSecrets('failed with Authorization: Bearer token123', [])).toBe(
      'failed with Authorization: Bearer [REDACTED]',
    );
  });

  it('ignores empty secrets', () => {
    expect(redactSecrets('hello', ['   '])).toBe('hello');
  });
});

describe('mapProcessingError', () => {
  it('maps an aborted signal to a labelled CancelledError', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => mapProcessingError('OpenAI', new Error('boom'), controller.signal)).toThrow(
      CancelledError,
    );
    try {
      mapProcessingError('OpenAI', new Error('boom'), controller.signal);
    } catch (error) {
      expect((error as Error).message).toBe('OpenAI processing was cancelled');
    }
  });

  it('maps an AbortError to a labelled CancelledError', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(() => mapProcessingError('DeepSeek', abort)).toThrow(CancelledError);
  });

  it('maps other failures to a labelled ProcessingError with the cause message', () => {
    try {
      mapProcessingError('DeepSeek', new Error('boom'));
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessingError);
      expect((error as Error).message).toBe('DeepSeek processing failed: boom');
    }
  });

  it('maps non-Error failures to a string description', () => {
    try {
      mapProcessingError('OpenAI', 'oops');
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessingError);
      expect((error as Error).message).toBe('OpenAI processing failed: oops');
    }
  });

  it('redacts supplied secrets from the surfaced message', () => {
    try {
      mapProcessingError('OpenAI', new Error('Bearer sk-secret-key rejected'), undefined, [
        'sk-secret-key',
      ]);
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessingError);
      expect((error as Error).message).toBe('OpenAI processing failed: Bearer [REDACTED] rejected');
      expect((error as Error).message).not.toContain('sk-secret-key');
    }
  });
});

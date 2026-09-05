import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import { assertKnownProvider, listProviders, resolveProcessor } from 'owlie';

describe('listProviders', () => {
  it('lists registered providers with a model-discovery base URL', () => {
    expect(listProviders()).toEqual([
      { id: 'deepseek', baseUrl: 'https://api.deepseek.com' },
      { id: 'openai', baseUrl: 'https://api.openai.com/v1' },
    ]);
  });
});

describe('resolveProcessor', () => {
  it('resolves DeepSeek for an explicit provider and model', () => {
    expect(resolveProcessor('deepseek', 'deepseek-chat', { apiKey: 'sk-test' }).id).toBe(
      'deepseek',
    );
    expect(resolveProcessor('deepseek', 'deepseek-reasoner', { apiKey: 'sk-test' }).id).toBe(
      'deepseek',
    );
  });

  it('resolves OpenAI for an explicit provider and model', () => {
    expect(resolveProcessor('openai', 'gpt-4o-mini', { apiKey: 'sk-test' }).id).toBe('openai');
  });

  it('never infers a provider from a model id', () => {
    // A model id that happens to look like another provider's does not switch
    // providers: the explicit provider always wins.
    expect(resolveProcessor('deepseek', 'gpt-4o-mini', { apiKey: 'sk-test' }).id).toBe('deepseek');
  });

  it('errors when no provider is selected', () => {
    expect(() => resolveProcessor(undefined, 'deepseek-chat', { apiKey: 'sk-test' })).toThrow(
      ConfigurationError,
    );
    expect(() => resolveProcessor('', 'deepseek-chat', { apiKey: 'sk-test' })).toThrow(
      ConfigurationError,
    );
  });

  it('errors on an unknown provider', () => {
    expect(() => resolveProcessor('anthropic', 'claude-3', { apiKey: 'sk-test' })).toThrow(
      ConfigurationError,
    );
  });

  it('errors when no model is selected for the provider', () => {
    expect(() => resolveProcessor('deepseek', undefined, { apiKey: 'sk-test' })).toThrow(
      ConfigurationError,
    );
    expect(() => resolveProcessor('openai', '', { apiKey: 'sk-test' })).toThrow(ConfigurationError);
  });

  it('accepts any non-empty model id (lenient, provider validates at call time)', () => {
    expect(resolveProcessor('deepseek', 'some-new-model', { apiKey: 'sk-test' }).id).toBe(
      'deepseek',
    );
  });
});

describe('assertKnownProvider', () => {
  it('accepts registered providers', () => {
    expect(() => assertKnownProvider('deepseek')).not.toThrow();
    expect(() => assertKnownProvider('openai')).not.toThrow();
  });

  it('rejects unknown providers', () => {
    expect(() => assertKnownProvider('anthropic')).toThrow(ConfigurationError);
  });
});

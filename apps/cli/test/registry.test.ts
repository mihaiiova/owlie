import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import { listProviders, resolveProcessor } from 'owlie';

describe('listProviders', () => {
  it('lists registered providers and their models', () => {
    expect(listProviders()).toEqual([
      { id: 'deepseek', models: ['deepseek-chat', 'deepseek-reasoner'] },
    ]);
  });
});

describe('resolveProcessor', () => {
  it('resolves the DeepSeek provider for a deepseek model', () => {
    expect(resolveProcessor('deepseek-chat', { apiKey: 'sk-test' }).id).toBe('deepseek');
    expect(resolveProcessor('deepseek-reasoner', { apiKey: 'sk-test' }).id).toBe('deepseek');
  });

  it('errors when no model is selected', () => {
    expect(() => resolveProcessor(undefined, { apiKey: 'sk-test' })).toThrow(ConfigurationError);
    expect(() => resolveProcessor('', { apiKey: 'sk-test' })).toThrow(ConfigurationError);
  });

  it('accepts any non-empty model id (lenient)', () => {
    expect(resolveProcessor('some-new-model', { apiKey: 'sk-test' }).id).toBe('deepseek');
  });
});

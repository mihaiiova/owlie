import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import { OpenAIProcessor, validateOpenAIConfig } from '@owlieio/provider-openai';

describe('OpenAIConfig validation', () => {
  it('accepts a config with an api key', () => {
    expect(validateOpenAIConfig({ apiKey: 'sk-test' }).apiKey).toBe('sk-test');
  });

  it('rejects an empty api key', () => {
    expect(() => validateOpenAIConfig({ apiKey: '' })).toThrow(ConfigurationError);
    expect(() => validateOpenAIConfig({ apiKey: '   ' })).toThrow(ConfigurationError);
  });
});

describe('OpenAIProcessor', () => {
  it('has a stable id', () => {
    const processor = new OpenAIProcessor({ apiKey: 'sk-test' });
    expect(processor.id).toBe('openai');
  });
});

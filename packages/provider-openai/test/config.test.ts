import { describe, expect, it } from 'vitest';
import { ConfigurationError, NotImplementedError } from '@owlieio/core';
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
  it('is a non-functional scaffold', async () => {
    const processor = new OpenAIProcessor({ apiKey: 'sk-test' });
    expect(processor.id).toBe('openai');
    await expect(
      processor.process({
        document: {
          schemaVersion: 1,
          id: '1',
          sourceType: 'rss',
          canonicalUrl: 'u',
          mediaType: 'text',
          text: 'x',
          metadata: {},
        },
      }),
    ).rejects.toThrow(NotImplementedError);
  });
});

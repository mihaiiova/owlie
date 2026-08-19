import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import {
  DEFAULT_DEEPSEEK_MODEL,
  DeepSeekProcessor,
  validateDeepSeekConfig,
} from '@owlieio/provider-deepseek';

describe('DeepSeekConfig validation', () => {
  it('accepts a config with an api key', () => {
    expect(validateDeepSeekConfig({ apiKey: 'sk-test' }).apiKey).toBe('sk-test');
  });

  it('rejects an empty api key', () => {
    expect(() => validateDeepSeekConfig({ apiKey: '' })).toThrow(ConfigurationError);
    expect(() => validateDeepSeekConfig({ apiKey: '   ' })).toThrow(ConfigurationError);
  });
});

describe('DeepSeekProcessor', () => {
  it('has a stable id and a documented default model', () => {
    const processor = new DeepSeekProcessor({ apiKey: 'sk-test' });
    expect(processor.id).toBe('deepseek');
    expect(DEFAULT_DEEPSEEK_MODEL).toBe('deepseek-chat');
  });
});

import { describe, expect, it } from 'vitest';

import { resolveReleaseConfig } from './config.mjs';

const validEnv = {
  OWLIE_E2E_EXPECTED_VERSION: '0.1.0',
  OWLIE_E2E_ARTICLE_URL: 'https://example.com/article.html',
  OWLIE_E2E_RSS_URL: 'https://example.com/feed.xml',
  OWLIE_E2E_YOUTUBE_URL: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  DEEPSEEK_API_KEY: 'sk-live-123',
};

describe('resolveReleaseConfig', () => {
  it('returns config when every required value is present', () => {
    const result = resolveReleaseConfig(validEnv);
    expect(result.ok).toBe(true);
    expect(result.config).toEqual({
      expectedVersion: '0.1.0',
      articleUrl: 'https://example.com/article.html',
      feedUrl: 'https://example.com/feed.xml',
      youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      apiKey: 'sk-live-123',
      proxyUrl: undefined,
    });
  });

  it('trims the expected version', () => {
    const result = resolveReleaseConfig({ ...validEnv, OWLIE_E2E_EXPECTED_VERSION: ' 0.1.0 ' });
    expect(result.config.expectedVersion).toBe('0.1.0');
  });

  it('reports each missing required variable', () => {
    const result = resolveReleaseConfig({});
    const text = result.errors.join('\n');
    expect(result.ok).toBe(false);
    expect(text).toMatch(/OWLIE_E2E_EXPECTED_VERSION/);
    expect(text).toMatch(/OWLIE_E2E_ARTICLE_URL/);
    expect(text).toMatch(/DEEPSEEK_API_KEY/);
  });

  it('rejects non-http(s) source URLs', () => {
    const result = resolveReleaseConfig({
      ...validEnv,
      OWLIE_E2E_RSS_URL: 'file:///tmp/feed.xml',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/http/i);
  });

  it('treats the proxy URL as optional', () => {
    const result = resolveReleaseConfig({ ...validEnv, OWLIE_E2E_PROXY_URL: 'http://p:8080' });
    expect(result.ok).toBe(true);
    expect(result.config.proxyUrl).toBe('http://p:8080');
  });
});

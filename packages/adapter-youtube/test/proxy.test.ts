import { describe, expect, it } from 'vitest';
import { GenericProxyConfig, WebshareProxyConfig } from '@hallelx/youtube-transcript';
import { toProxyConfig, transcriptApiOptions } from '@owlieio/adapter-youtube';

describe('toProxyConfig', () => {
  it('returns undefined for no proxy', () => {
    expect(toProxyConfig(undefined)).toBeUndefined();
  });

  it('builds a WebShare proxy config', () => {
    const config = toProxyConfig({ type: 'webshare', username: 'user', password: 'pass' });
    expect(config).toBeInstanceOf(WebshareProxyConfig);
  });

  it('builds a generic proxy config', () => {
    const config = toProxyConfig({ type: 'generic', url: 'http://proxy:8080' });
    expect(config).toBeInstanceOf(GenericProxyConfig);
    expect(config?.httpUrl).toBe('http://proxy:8080');
  });
});

describe('transcriptApiOptions', () => {
  it('uses the proxy and omits fetchFn when a proxy is configured', () => {
    const options = transcriptApiOptions(
      { type: 'webshare', username: 'u', password: 'p' },
      undefined,
      undefined,
    );
    expect(options.proxyConfig).toBeInstanceOf(WebshareProxyConfig);
    expect(options.fetchFn).toBeUndefined();
  });

  it('uses fetchFn when no proxy is configured', () => {
    const options = transcriptApiOptions(undefined, undefined, new AbortController().signal);
    expect(options.fetchFn).toBeDefined();
    expect(options.proxyConfig).toBeUndefined();
  });
});

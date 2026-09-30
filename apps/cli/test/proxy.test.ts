import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import { extractionNetwork, proxiedFetch, proxyReport, proxyUrl, resolveProxy } from 'owlie';

const noFiles = () => ({});
const noConfig = () => ({});

describe('resolveProxy', () => {
  it('returns no proxy when nothing is configured', () => {
    expect(resolveProxy({}, {}, noFiles, noConfig)).toEqual({ source: null });
  });

  it('reads a proxy URL from the process environment', () => {
    const env = { OWLIE_PROXY_URL: 'http://user:pass@proxy.example:8080' };
    expect(resolveProxy({}, env, noFiles, noConfig)).toEqual({
      proxy: { type: 'generic', url: 'http://user:pass@proxy.example:8080' },
      source: 'env',
    });
  });

  it.each(['https://proxy.example:443', 'socks5://proxy.example:1080'])(
    'accepts the %s scheme',
    (url) => {
      expect(resolveProxy({}, { OWLIE_PROXY_URL: url }, noFiles, noConfig).proxy).toEqual({
        type: 'generic',
        url,
      });
    },
  );

  it('reads a Webshare pair from the process environment', () => {
    const env = { OWLIE_WEBSHARE_PROXY_USERNAME: 'user', OWLIE_WEBSHARE_PROXY_PASSWORD: 'secret' };
    expect(resolveProxy({}, env, noFiles, noConfig)).toEqual({
      proxy: { type: 'webshare', username: 'user', password: 'secret' },
      source: 'env',
    });
  });

  it.each([
    [
      'both forms',
      {
        OWLIE_PROXY_URL: 'http://proxy.example:8080',
        OWLIE_WEBSHARE_PROXY_USERNAME: 'user',
        OWLIE_WEBSHARE_PROXY_PASSWORD: 'secret',
      },
      'not both',
    ],
    ['a lone Webshare username', { OWLIE_WEBSHARE_PROXY_USERNAME: 'user' }, 'set together'],
    ['a lone Webshare password', { OWLIE_WEBSHARE_PROXY_PASSWORD: 'secret' }, 'set together'],
    ['a malformed URL', { OWLIE_PROXY_URL: 'not a url secret' }, 'not a valid proxy URL'],
    ['an unsupported scheme', { OWLIE_PROXY_URL: 'ftp://secret@proxy.example' }, 'socks5://'],
  ])('rejects %s without echoing values', (_label, env, message) => {
    let caught: unknown;
    try {
      resolveProxy({}, env, noFiles, noConfig);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigurationError);
    expect((caught as Error).message).toContain(message);
    expect((caught as Error).message).not.toContain('secret');
  });

  it('lets the first layer that sets any proxy variable win', () => {
    const files: Record<string, Record<string, string>> = {
      '.env.local': { OWLIE_PROXY_URL: 'http://local.example:1' },
      '.env': { OWLIE_WEBSHARE_PROXY_USERNAME: 'only-username' },
    };
    const resolved = resolveProxy({}, {}, (path) => files[path] ?? {}, noConfig);
    expect(resolved).toEqual({
      proxy: { type: 'generic', url: 'http://local.example:1' },
      source: 'env-file',
    });
  });

  it('prefers an explicit --env-file over .env.local and .env', () => {
    const files: Record<string, Record<string, string>> = {
      'custom.env': { OWLIE_PROXY_URL: 'http://custom.example:1' },
      '.env.local': { OWLIE_PROXY_URL: 'http://local.example:1' },
    };
    expect(
      resolveProxy({ envFile: 'custom.env' }, {}, (path) => files[path] ?? {}, noConfig).proxy,
    ).toEqual({ type: 'generic', url: 'http://custom.example:1' });
  });

  it('falls back to the saved user configuration', () => {
    const config = () => ({
      proxy: { type: 'webshare' as const, username: 'saved', password: 'secret' },
    });
    expect(resolveProxy({}, {}, noFiles, config)).toEqual({
      proxy: { type: 'webshare', username: 'saved', password: 'secret' },
      source: 'user-config',
    });
  });

  it('reads only the process environment in hosted mode', () => {
    let filesRead = 0;
    let configRead = 0;
    const resolved = resolveProxy(
      { hosted: true, envFile: 'custom.env' },
      {},
      () => {
        filesRead++;
        return { OWLIE_PROXY_URL: 'http://file.example:1' };
      },
      () => {
        configRead++;
        return { proxy: { type: 'generic', url: 'http://saved.example:1' } };
      },
    );
    expect(resolved).toEqual({ source: null });
    expect(filesRead).toBe(0);
    expect(configRead).toBe(0);
    expect(
      resolveProxy({ hosted: true }, { OWLIE_PROXY_URL: 'http://env.example:1' }, noFiles, noConfig)
        .source,
    ).toBe('env');
  });
});

describe('proxyReport', () => {
  it('reports mode and source without host or credentials', () => {
    expect(proxyReport({ source: null })).toEqual({ mode: 'none', source: null });
    const report = proxyReport({
      proxy: { type: 'generic', url: 'http://user:secret@proxy.example:8080' },
      source: 'env',
    });
    expect(report).toEqual({ mode: 'url', source: 'env' });
    expect(JSON.stringify(report)).not.toContain('proxy.example');
    expect(
      proxyReport({
        proxy: { type: 'webshare', username: 'u', password: 'p' },
        source: 'user-config',
      }),
    ).toEqual({ mode: 'webshare', source: 'user-config' });
  });
});

describe('proxyUrl', () => {
  it('uses a proxy URL as given', () => {
    expect(proxyUrl({ type: 'generic', url: 'socks5://proxy.example:1080' })).toBe(
      'socks5://proxy.example:1080',
    );
  });

  it("maps a Webshare pair to Webshare's rotating endpoint", () => {
    expect(proxyUrl({ type: 'webshare', username: 'user', password: 'p@ss' })).toBe(
      'http://user-rotate:p%40ss@p.webshare.io:80',
    );
  });
});

describe('extractionNetwork', () => {
  it('builds the fetcher for the resolved proxy', () => {
    const seen: unknown[] = [];
    const network = extractionNetwork(
      { hosted: true },
      {
        env: { OWLIE_PROXY_URL: 'http://proxy.example:8080' },
        createFetcher: (proxy) => {
          seen.push(proxy);
          return { fetch: async () => ({ url: '', contentType: null, text: '' }) };
        },
      },
    );
    expect(seen).toEqual([{ type: 'generic', url: 'http://proxy.example:8080' }]);
    expect(network.resolved.source).toBe('env');
  });

  it('gives YouTube the library Webshare config, or the proxied fetch for a URL', () => {
    const webshare = extractionNetwork(
      { hosted: true },
      { env: { OWLIE_WEBSHARE_PROXY_USERNAME: 'u', OWLIE_WEBSHARE_PROXY_PASSWORD: 'p' } },
    );
    expect(webshare.youtube).toEqual({ proxy: { type: 'webshare', username: 'u', password: 'p' } });

    const url = extractionNetwork(
      { hosted: true },
      { env: { OWLIE_PROXY_URL: 'socks5://proxy.example:1080' } },
    );
    expect(url.youtube.proxy).toBeUndefined();
    expect(typeof url.youtube.fetchFn).toBe('function');

    expect(extractionNetwork({ hosted: true }, { env: {} }).youtube).toEqual({});
  });
});

describe('proxiedFetch', () => {
  it('tunnels requests through the proxy with basic proxy credentials', async () => {
    const { createServer } = await import('node:http');
    const seen: { target?: string; auth?: string } = {};
    const server = createServer();
    server.on('connect', (request, socket) => {
      seen.target = request.url;
      seen.auth = request.headers['proxy-authorization'];
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.once('data', () => {
        socket.end(
          'HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 7\r\nconnection: close\r\n\r\nproxied',
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      const fetchThroughProxy = proxiedFetch({
        type: 'generic',
        url: `http://user:p%40ss@127.0.0.1:${port}`,
      });
      const response = await fetchThroughProxy('http://target.example/page');
      expect(await response.text()).toBe('proxied');
      expect(seen.target).toBe('target.example:80');
      expect(seen.auth).toBe(`Basic ${Buffer.from('user:p@ss').toString('base64')}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

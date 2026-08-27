import { describe, expect, it } from 'vitest';
import {
  assertSafeHttpUrl,
  assertSafeResolvedHost,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  ExtractionError,
  isBlockedHost,
  isBlockedIp,
  type DnsResolver,
  type HttpFetchFn,
} from '@owlieio/core';

describe('isBlockedHost', () => {
  it('blocks IPv4 loopback', () => {
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('127.255.255.255')).toBe(true);
  });

  it('blocks IPv4 private ranges', () => {
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('10.255.255.255')).toBe(true);
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('172.31.255.255')).toBe(true);
    expect(isBlockedHost('192.168.0.1')).toBe(true);
    expect(isBlockedHost('192.168.255.255')).toBe(true);
  });

  it('blocks IPv4 link-local and metadata addresses', () => {
    expect(isBlockedHost('169.254.0.1')).toBe(true);
    expect(isBlockedHost('169.254.169.254')).toBe(true);
  });

  it('blocks IPv6 loopback, unspecified, link-local, and unique-local', () => {
    expect(isBlockedHost('::1')).toBe(true);
    expect(isBlockedHost('::')).toBe(true);
    expect(isBlockedHost('fe80::1')).toBe(true);
    expect(isBlockedHost('fe80:abcd::')).toBe(true);
    expect(isBlockedHost('fc00::1')).toBe(true);
    expect(isBlockedHost('fd12:3456::')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback and private addresses', () => {
    expect(isBlockedHost('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedHost('::ffff:192.168.1.1')).toBe(true);
  });

  it('blocks localhost and reserved hostname suffixes', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('foo.localhost')).toBe(true);
    expect(isBlockedHost('foo.local')).toBe(true);
    expect(isBlockedHost('foo.internal')).toBe(true);
    expect(isBlockedHost('foo.home.arpa')).toBe(true);
  });

  it('allows public IPv4, IPv6, and hostnames', () => {
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('1.1.1.1')).toBe(false);
    expect(isBlockedHost('172.15.0.1')).toBe(false);
    expect(isBlockedHost('172.32.0.1')).toBe(false);
    expect(isBlockedHost('192.169.0.1')).toBe(false);
    expect(isBlockedHost('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('sub.example.com')).toBe(false);
  });

  it('ignores brackets and a trailing dot', () => {
    expect(isBlockedHost('[::1]')).toBe(true);
    expect(isBlockedHost('example.com.')).toBe(false);
  });
});

describe('assertSafeHttpUrl', () => {
  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeHttpUrl('ftp://example.com/feed')).toThrow(ConfigurationError);
    expect(() => assertSafeHttpUrl('file:///etc/passwd')).toThrow(ConfigurationError);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeHttpUrl('not a url')).toThrow(ConfigurationError);
  });

  it('rejects blocked hosts by default', () => {
    expect(() => assertSafeHttpUrl('http://127.0.0.1/feed.xml')).toThrow(ExtractionError);
    expect(() => assertSafeHttpUrl('http://localhost/feed.xml')).toThrow(ExtractionError);
  });

  it('allows public http(s) URLs', () => {
    expect(assertSafeHttpUrl('https://example.com/feed.xml').href).toBe(
      'https://example.com/feed.xml',
    );
    expect(assertSafeHttpUrl('http://example.com/feed.xml').protocol).toBe('http:');
  });

  it('allows blocked hosts when opted in', () => {
    expect(
      assertSafeHttpUrl('http://localhost/feed.xml', { allowPrivateHosts: true }).hostname,
    ).toBe('localhost');
  });
});

describe('isBlockedIp', () => {
  it('blocks private IPv4 and IPv6 address literals', () => {
    expect(isBlockedIp('192.168.1.50')).toBe(true);
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('fd12:3456::')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('allows public IPv4 and IPv6 address literals', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false);
  });
});

describe('assertSafeResolvedHost', () => {
  const resolveTo =
    (addresses: string[]): DnsResolver =>
    async () =>
      addresses;

  it('rejects a hostname resolving to a private IPv4 address', async () => {
    await expect(
      assertSafeResolvedHost('evil.example.com', resolveTo(['192.168.1.50'])),
    ).rejects.toThrow(ExtractionError);
  });

  it('rejects a hostname resolving to the metadata service', async () => {
    await expect(
      assertSafeResolvedHost('evil.example.com', resolveTo(['169.254.169.254'])),
    ).rejects.toThrow(ExtractionError);
  });

  it('rejects when any resolved address is private, even in a mixed record', async () => {
    await expect(
      assertSafeResolvedHost('evil.example.com', resolveTo(['8.8.8.8', '10.0.0.1'])),
    ).rejects.toThrow(ExtractionError);
  });

  it('rejects a hostname resolving to a private IPv6 address', async () => {
    await expect(
      assertSafeResolvedHost('evil.example.com', resolveTo(['fe80::1'])),
    ).rejects.toThrow(ExtractionError);
  });

  it('allows a hostname resolving only to public addresses', async () => {
    await expect(
      assertSafeResolvedHost('example.com', resolveTo(['8.8.8.8', '1.1.1.1'])),
    ).resolves.toBeUndefined();
  });

  it('surfaces a resolution failure as ExtractionError', async () => {
    const fail: DnsResolver = async () => {
      throw new Error('ENOTFOUND evil.example.com');
    };
    await expect(assertSafeResolvedHost('missing.example.com', fail)).rejects.toThrow(
      ExtractionError,
    );
  });
});

describe('DefaultHttpFetcher', () => {
  function ok(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }

  const publicResolver: DnsResolver = async () => ['8.8.8.8'];

  it('returns the response body and sends an identifying User-Agent', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchFn: HttpFetchFn = async (input, init) => {
      calls.push({
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return ok('<rss/>');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(fetcher.fetchText('https://example.com/feed.xml')).resolves.toBe('<rss/>');
    expect(calls[0]!.headers['user-agent']).toBe('owlie-cli');
  });

  it('returns bounded text with the final URL and declared media type', async () => {
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      if (url === 'https://example.com/start') {
        return new Response('', {
          status: 302,
          headers: { location: 'https://example.com/article' },
        });
      }
      return ok('<article>Readable text</article>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(fetcher.fetch('https://example.com/start')).resolves.toEqual({
      text: '<article>Readable text</article>',
      url: 'https://example.com/article',
      contentType: 'text/html; charset=utf-8',
    });
  });

  it('honors a custom User-Agent', async () => {
    const calls: Array<string | null> = [];
    const fetchFn: HttpFetchFn = async (_input, init) => {
      calls.push(new Headers(init?.headers).get('user-agent'));
      return ok('body');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await fetcher.fetchText('https://example.com/', { policy: { userAgent: 'test-agent' } });
    expect(calls[0]).toBe('test-agent');
  });

  it('rejects a blocked host before fetching', async () => {
    let called = false;
    const fetchFn: HttpFetchFn = async () => {
      called = true;
      return ok('body');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(fetcher.fetchText('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      ExtractionError,
    );
    expect(called).toBe(false);
  });

  it('follows redirects and re-validates each hop', async () => {
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      if (url === 'https://example.com/a') {
        return new Response('', { status: 302, headers: { location: 'https://example.com/b' } });
      }
      return ok('final');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(fetcher.fetchText('https://example.com/a')).resolves.toBe('final');
  });

  it('rejects a redirect to a blocked host', async () => {
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      if (url === 'https://example.com/a') {
        return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/x' } });
      }
      return ok('final');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(fetcher.fetchText('https://example.com/a')).rejects.toThrow(ExtractionError);
  });

  it('caps redirects and stops at the configured limit', async () => {
    const visited: string[] = [];
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      visited.push(url);
      const n = Number(url.split('/n')[1] ?? '0');
      return new Response('', {
        status: 302,
        headers: { location: `https://example.com/n${n + 1}` },
      });
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(
      fetcher.fetchText('https://example.com/n0', { policy: { maxRedirects: 2 } }),
    ).rejects.toThrow(ExtractionError);
    // Two redirects followed (n0 -> n1 -> n2); the third is refused.
    expect(visited).toEqual([
      'https://example.com/n0',
      'https://example.com/n1',
      'https://example.com/n2',
    ]);
  });

  it('maps HTTP errors to ExtractionError', async () => {
    const fetchFn: HttpFetchFn = async () => ok('oops', { status: 500 });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(fetcher.fetchText('https://example.com/')).rejects.toThrow(ExtractionError);
  });

  it('enforces a response size limit', async () => {
    const fetchFn: HttpFetchFn = async () => ok('a'.repeat(100));
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(
      fetcher.fetchText('https://example.com/', { policy: { maxResponseBytes: 10 } }),
    ).rejects.toThrow(ExtractionError);
  });

  it('cancels on timeout', async () => {
    const fetchFn: HttpFetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')), {
          once: true,
        });
      });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(
      fetcher.fetchText('https://example.com/', { policy: { timeoutMs: 20 } }),
    ).rejects.toThrow(CancelledError);
  });

  it('cancels a response body that stalls after headers arrive', async () => {
    let cancelled = false;
    const fetchFn: HttpFetchFn = async () => {
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/html' } });
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(
      fetcher.fetchText('https://example.com/', { policy: { timeoutMs: 20 } }),
    ).rejects.toThrow(CancelledError);
    expect(cancelled).toBe(true);
  });

  it('cancels on an external abort signal', async () => {
    const fetchFn: HttpFetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')), {
          once: true,
        });
      });
    const controller = new AbortController();
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    const promise = fetcher.fetchText('https://example.com/', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(CancelledError);
  });

  it('rejects a hostname that resolves to a private address before fetching', async () => {
    let called = false;
    const fetchFn: HttpFetchFn = async () => {
      called = true;
      return ok('body');
    };
    const resolver: DnsResolver = async () => ['192.168.1.50'];
    const fetcher = new DefaultHttpFetcher(fetchFn, resolver);
    await expect(fetcher.fetchText('https://evil.example.com/feed')).rejects.toThrow(
      ExtractionError,
    );
    expect(called).toBe(false);
  });

  it('resolves the hostname before fetching a public URL', async () => {
    const resolved: string[] = [];
    const fetchFn: HttpFetchFn = async () => ok('body');
    const resolver: DnsResolver = async (hostname) => {
      resolved.push(hostname);
      return ['8.8.8.8'];
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, resolver);
    await expect(fetcher.fetchText('https://example.com/feed')).resolves.toBe('body');
    expect(resolved).toEqual(['example.com']);
  });

  it('rejects a redirect to a hostname that resolves to a private address', async () => {
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      if (url === 'https://example.com/a') {
        return new Response('', {
          status: 302,
          headers: { location: 'https://evil.example.com/b' },
        });
      }
      return ok('final');
    };
    const resolver: DnsResolver = async (hostname) =>
      hostname === 'evil.example.com' ? ['10.0.0.1'] : ['8.8.8.8'];
    const fetcher = new DefaultHttpFetcher(fetchFn, resolver);
    await expect(fetcher.fetchText('https://example.com/a')).rejects.toThrow(ExtractionError);
  });

  it('skips DNS resolution when allowPrivateHosts is set', async () => {
    let resolved = false;
    const fetchFn: HttpFetchFn = async () => ok('body');
    const resolver: DnsResolver = async () => {
      resolved = true;
      return ['8.8.8.8'];
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, resolver);
    await expect(
      fetcher.fetchText('https://example.com/', { policy: { allowPrivateHosts: true } }),
    ).resolves.toBe('body');
    expect(resolved).toBe(false);
  });
});

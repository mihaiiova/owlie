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

  it('blocks equivalent IPv4-mapped IPv6 loopback and private addresses', () => {
    for (const address of [
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '0:0:0:0:0:ffff:7f00:1',
      '::FFFF:C0A8:101',
      '::ffff:192.168.1.1',
    ]) {
      expect(isBlockedHost(address)).toBe(true);
    }
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

  it('rejects malformed URLs without echoing their contents', () => {
    const malformed = 'https://alice:malformed-secret@[invalid';
    let error: unknown;
    try {
      assertSafeHttpUrl(malformed);
    } catch (reason) {
      error = reason;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).not.toContain('malformed-secret');
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

  it('rejects username, password, and percent-encoded URL credentials', () => {
    for (const url of [
      'https://alice@example.com/feed',
      'https://alice:secret@example.com/feed',
      'https://alice:p%40ssword@example.com/feed',
    ]) {
      expect(() => assertSafeHttpUrl(url)).toThrow(ExtractionError);
    }
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

  it('blocks non-public and special-purpose address ranges', () => {
    for (const address of [
      '0.0.0.0',
      '100.64.0.1',
      '198.18.0.1',
      '192.0.2.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '2001:db8::1',
      '2002::1',
      '2001::1',
      'ff02::1',
      'not-an-address',
    ]) {
      expect(isBlockedIp(address)).toBe(true);
    }
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

  it('rejects mapped loopback and private DNS results', async () => {
    await expect(
      assertSafeResolvedHost('evil.example.com', resolveTo(['::ffff:7f00:1'])),
    ).rejects.toThrow(ExtractionError);
    await expect(
      assertSafeResolvedHost('evil.example.com', resolveTo(['::ffff:c0a8:101'])),
    ).rejects.toThrow(ExtractionError);
  });

  it('allows private DNS results only when explicitly opted in', async () => {
    await expect(
      assertSafeResolvedHost('internal.example.com', resolveTo(['10.0.0.1']), {
        allowPrivateHosts: true,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertSafeResolvedHost('multicast.example.com', resolveTo(['224.0.0.1']), {
        allowPrivateHosts: true,
      }),
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

  it('rejects canonical IPv4-mapped IPv6 loopback before fetching', async () => {
    let called = false;
    const fetchFn: HttpFetchFn = async () => {
      called = true;
      return ok('body');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(fetcher.fetchText('http://[::ffff:127.0.0.1]/metadata')).rejects.toThrow(
      ExtractionError,
    );
    expect(called).toBe(false);
  });

  it('rejects URL credentials before fetching even when private hosts are allowed', async () => {
    let called = false;
    const fetchFn: HttpFetchFn = async () => {
      called = true;
      return ok('body');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(
      fetcher.fetchText('https://alice:supersecret@example.com/article', {
        policy: { allowPrivateHosts: true },
      }),
    ).rejects.toThrow(ExtractionError);
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

  it('rejects URL credentials introduced by a redirect before following it', async () => {
    const visited: string[] = [];
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      visited.push(url);
      return new Response('', {
        status: 302,
        headers: { location: 'https://alice:redirect-secret@example.com/private' },
      });
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(fetcher.fetchText('https://example.com/start')).rejects.toThrow(ExtractionError);
    expect(visited).toEqual(['https://example.com/start']);
  });

  it('caps redirects and redacts the requested URL in the error', async () => {
    const visited: string[] = [];
    const fetchFn: HttpFetchFn = async (input) => {
      const url = String(input);
      visited.push(url);
      const n = visited.length;
      return new Response('', {
        status: 302,
        headers: { location: `https://example.com/n${n}` },
      });
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    const error = await fetcher
      .fetchText('https://example.com/n0?token=query-secret#fragment-secret', {
        policy: { maxRedirects: 2 },
      })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as Error).message).toContain('https://example.com/n0');
    expect((error as Error).message).not.toContain('query-secret');
    expect((error as Error).message).not.toContain('fragment-secret');
    // Two redirects followed (n0 -> n1 -> n2); the third is refused.
    expect(visited).toEqual([
      'https://example.com/n0?token=query-secret#fragment-secret',
      'https://example.com/n1',
      'https://example.com/n2',
    ]);
  });

  it('redacts the current URL when a redirect is malformed', async () => {
    const fetchFn: HttpFetchFn = async () =>
      new Response('', { status: 302, headers: { location: 'http://[invalid-secret' } });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    const error = await fetcher
      .fetchText('https://example.com/start?token=query-secret#fragment-secret')
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as Error).message).toContain('https://example.com/start');
    expect((error as Error).message).not.toContain('query-secret');
    expect((error as Error).message).not.toContain('fragment-secret');
    expect((error as Error).message).not.toContain('invalid-secret');
  });

  it('maps HTTP errors to ExtractionError', async () => {
    const fetchFn: HttpFetchFn = async () => ok('oops', { status: 500 });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);
    await expect(fetcher.fetchText('https://example.com/')).rejects.toThrow(ExtractionError);
  });

  it('keeps origin and path but removes query and fragment from diagnostics', async () => {
    const fetchFn: HttpFetchFn = async () => ok('oops', { status: 500 });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    const error = await fetcher
      .fetchText('https://example.com/private/article?token=query-secret#fragment-secret')
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as Error).message).toContain('https://example.com/private/article');
    expect((error as Error).message).not.toContain('query-secret');
    expect((error as Error).message).not.toContain('fragment-secret');
  });

  it('redacts the requested URL when a transport fails', async () => {
    const fetchFn: HttpFetchFn = async () => {
      throw new Error('socket closed');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    const error = await fetcher
      .fetchText('https://example.com/private/article?token=query-secret#fragment-secret')
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect((error as Error).message).toContain('https://example.com/private/article');
    expect((error as Error).message).not.toContain('query-secret');
    expect((error as Error).message).not.toContain('fragment-secret');
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

  it('allows private and local destination categories when explicitly opted in', async () => {
    const fetchFn: HttpFetchFn = async () => ok('body');
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    for (const url of [
      'http://10.0.0.1/',
      'http://100.64.0.1/',
      'http://127.0.0.1/',
      'http://169.254.1.1/',
      'http://[fc00::1]/',
      'http://[fe80::1]/',
      'http://[::1]/',
    ]) {
      await expect(fetcher.fetchText(url, { policy: { allowPrivateHosts: true } })).resolves.toBe(
        'body',
      );
    }
  });

  it('still rejects unsafe special-purpose destinations when private hosts are allowed', async () => {
    let calls = 0;
    const fetchFn: HttpFetchFn = async () => {
      calls += 1;
      return ok('body');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    for (const url of [
      'http://0.0.0.0/',
      'http://192.0.2.1/',
      'http://198.18.0.1/',
      'http://224.0.0.1/',
      'http://255.255.255.255/',
      'http://[::]/',
      'http://[2001:db8::1]/',
      'http://[2002::1]/',
      'http://[ff02::1]/',
    ]) {
      await expect(fetcher.fetchText(url, { policy: { allowPrivateHosts: true } })).rejects.toThrow(
        ExtractionError,
      );
    }
    expect(calls).toBe(0);
  });
});

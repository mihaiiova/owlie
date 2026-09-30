import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { ExitCode, extractionNetwork, run } from 'owlie';
import type { CliDeps, CliIo, ExtractionNetworkDeps, ExtractionProxy } from 'owlie';

const ARTICLE_URL = 'https://example.com/posts/story';
const FEED_URL = 'https://example.com/feed.xml';
const MEDIA_URL = 'https://cdn.example.com/episode.mp3';

const ARTICLE = `<!doctype html><html><head><title>Story</title>
<meta property="og:type" content="article"></head>
<body><article><h1>Story</h1><p>${'A readable paragraph of static article prose for the proxy test. '.repeat(6)}</p></article></body></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>
<item><title>Entry</title><link>${ARTICLE_URL}</link><guid>entry-1</guid></item></channel></rss>`;

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: true, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

/** A fake extraction fetcher factory recording the proxy it was built for. */
function proxiedSite(pages: Record<string, HttpTextResponse>) {
  const built: (ExtractionProxy | undefined)[] = [];
  const fetched: string[] = [];
  const network: ExtractionNetworkDeps = {
    createFetcher: (proxy) => {
      built.push(proxy);
      const fetcher: HttpFetcher = {
        async fetch(url) {
          fetched.push(url);
          const page = pages[url];
          if (!page) throw new ExtractionError(`unexpected fetch: ${url}`);
          return page;
        },
      };
      return fetcher;
    },
  };
  return { network, built, fetched };
}

const PROXY_ENV = { OWLIE_PROXY_URL: 'http://user:s3cret@proxy.example:8080' };

describe('extraction traffic uses the configured proxy', () => {
  it('extract (hosted) builds its adapters on the proxied fetcher from process env', async () => {
    const site = proxiedSite({
      [ARTICLE_URL]: { url: ARTICLE_URL, contentType: 'text/html', text: ARTICLE },
    });
    const deps: CliDeps = { extract: { network: { ...site.network, env: PROXY_ENV } } };
    const { io, stdout } = capture();
    const code = await run(['--hosted', 'extract', ARTICLE_URL, '--json'], io, deps);

    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.sourceType).toBe('article');
    expect(site.built).toEqual([{ type: 'generic', url: PROXY_ENV.OWLIE_PROXY_URL }]);
    expect(site.fetched).toContain(ARTICLE_URL);
  });

  it('list reads the feed through the proxied fetcher', async () => {
    const site = proxiedSite({
      [FEED_URL]: { url: FEED_URL, contentType: 'application/rss+xml', text: FEED },
    });
    const deps: CliDeps = { list: { network: { ...site.network, env: PROXY_ENV } } };
    const { io } = capture();
    const code = await run(['--hosted', 'list', FEED_URL, '--json'], io, deps);

    expect(code).toBe(ExitCode.Success);
    expect(site.built).toHaveLength(1);
    expect(site.fetched).toEqual([FEED_URL]);
  });

  it('resolve validates media through the proxied fetcher', async () => {
    const site = proxiedSite({});
    const deps: CliDeps = { resolve: { network: { ...site.network, env: PROXY_ENV } } };
    const { io } = capture();
    await run(['--hosted', 'resolve', MEDIA_URL, '--podcast-media', '--json'], io, deps);
    expect(site.built).toEqual([{ type: 'generic', url: PROXY_ENV.OWLIE_PROXY_URL }]);
  });

  it('does not read proxy settings when every adapter is injected', async () => {
    const site = proxiedSite({});
    const deps: CliDeps = {
      list: {
        adapter: {
          id: 'rss',
          sourceType: 'rss',
          recognize: () => true,
          async resolve(locator) {
            return { id: 'rss:feed:x', sourceType: 'rss', canonicalUrl: locator.url, metadata: {} };
          },
          async list(collection) {
            return { collection, items: [], truncated: false };
          },
        },
        network: { ...site.network, env: { OWLIE_PROXY_URL: 'not a url' } },
      },
    };
    const { io } = capture();
    const code = await run(['--hosted', 'list', FEED_URL, '--json'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(site.built).toEqual([]);
  });

  it('reports an unusable proxy as a structured configuration error without secrets', async () => {
    const site = proxiedSite({});
    const deps: CliDeps = {
      extract: {
        network: {
          ...site.network,
          env: { OWLIE_PROXY_URL: 'ftp://user:s3cret@proxy.example', OWLIE_PROVIDER: 'x' },
        },
      },
    };
    const { io, stdout, stderr } = capture();
    const code = await run(['--hosted', 'extract', ARTICLE_URL, '--json'], io, deps);

    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    const record = JSON.parse(stderr().trim().split('\n').at(-1)!);
    expect(record).toMatchObject({ kind: 'error', code: 'CONFIGURATION_ERROR' });
    expect(record.message).toContain('OWLIE_PROXY_URL');
    expect(stderr()).not.toContain('s3cret');
    expect(site.built).toEqual([]);
  });
});

describe('proxied fetcher safety', () => {
  it('still refuses a private destination before contacting the proxy', async () => {
    const network = extractionNetwork(
      { hosted: true },
      { env: { OWLIE_PROXY_URL: 'http://proxy.invalid:1' } },
    );
    await expect(network.fetcher.fetch('http://127.0.0.1/admin')).rejects.toThrow();
    await expect(network.fetcher.fetch('http://169.254.169.254/latest')).rejects.toThrow();
  });
});

describe('doctor proxy report', () => {
  const baseDeps = {
    dirWritable: async () => true,
    toolAvailable: async () => false,
    readConfig: () => ({
      proxy: { type: 'webshare' as const, username: 'saved', password: 's3cret' },
    }),
    loadFile: () => ({}),
  };

  it('reports mode and source only', async () => {
    const { io, stdout } = capture();
    await run(['doctor', '--json'], io, { doctor: { ...baseDeps, env: PROXY_ENV } });
    const report = JSON.parse(stdout()).result;
    expect(report.proxy).toEqual({ mode: 'url', source: 'env' });
    expect(stdout()).not.toContain('proxy.example');
    expect(stdout()).not.toContain('s3cret');
  });

  it('falls back to the saved proxy locally and ignores it in hosted mode', async () => {
    const local = capture();
    await run(['doctor', '--json'], local.io, { doctor: { ...baseDeps, env: {} } });
    expect(JSON.parse(local.stdout()).result.proxy).toEqual({
      mode: 'webshare',
      source: 'user-config',
    });

    const hosted = capture();
    await run(['--hosted', 'doctor', '--json'], hosted.io, { doctor: { ...baseDeps, env: {} } });
    expect(JSON.parse(hosted.stdout()).result.proxy).toEqual({ mode: 'none', source: null });
  });

  it('reports invalid settings without their values', async () => {
    const { io, stdout } = capture();
    await run(['doctor', '--json'], io, {
      doctor: { ...baseDeps, env: { OWLIE_WEBSHARE_PROXY_PASSWORD: 's3cret' } },
    });
    const proxy = JSON.parse(stdout()).result.proxy;
    expect(proxy.mode).toBe('invalid');
    expect(proxy.error).toContain('must be set together');
    expect(stdout()).not.toContain('s3cret');
  });
});

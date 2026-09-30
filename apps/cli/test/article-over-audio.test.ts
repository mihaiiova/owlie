import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse, Transcriber } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { PodcastAdapter } from '@owlieio/adapter-podcast';
import { RssAdapter } from '@owlieio/adapter-rss';
import { ExitCode, createPodcastResolvers, extractWithFallback, run } from 'owlie';
import type { CliIo } from 'owlie';

const PAGE_URL = 'https://publisher.example/posts/story';

const DECLARED_ARTICLE_WITH_CLIP = `<!doctype html><html><head><title>Story</title>
<meta property="og:type" content="article"></head>
<body><article><h1>Story</h1>
<p>${'A readable paragraph of article prose that embeds a short audio clip. '.repeat(6)}</p>
<audio controls src="/media/clip.mp3"></audio>
</article></body></html>`;

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

function site(pages: Record<string, HttpTextResponse>) {
  const counts: Record<string, number> = {};
  const fetcher: HttpFetcher = {
    async fetch(url) {
      counts[url] = (counts[url] ?? 0) + 1;
      const page = pages[url];
      if (!page) throw new ExtractionError(`unexpected fetch: ${url}`);
      return page;
    },
  };
  return { fetcher, counts };
}

const neverTranscribe: Transcriber = {
  id: 'never',
  async transcribe() {
    throw new Error('the audio clip must not be transcribed');
  },
};

function adapters(fetcher: HttpFetcher) {
  return [
    new PodcastAdapter({
      fetcher,
      transcriber: neverTranscribe,
      cacheDir: '.owlie-test-cache',
      resolvers: createPodcastResolvers(fetcher),
    }),
    new ArticleAdapter({ fetcher }),
  ];
}

const pages = {
  [PAGE_URL]: { url: PAGE_URL, contentType: 'text/html', text: DECLARED_ARTICLE_WITH_CLIP },
};

describe('declared article pages win over embedded audio (#123)', () => {
  it('extract returns the article, fetching the page once', async () => {
    const { fetcher, counts } = site(pages);
    const { io, stdout } = capture();
    const code = await run(['extract', PAGE_URL, '--json'], io, {
      extract: { itemAdapters: adapters(fetcher), feedAdapter: new RssAdapter({ fetcher }) },
    });

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document).toMatchObject({
      sourceType: 'article',
      title: 'Story',
      provenance: { adapterId: 'article', warnings: [] },
    });
    expect(counts[PAGE_URL]).toBe(1);
  });

  it('the universal dispatch used by process picks the same path', async () => {
    const { fetcher } = site(pages);
    const { document } = await extractWithFallback(adapters(fetcher), { url: PAGE_URL });
    expect(document.sourceType).toBe('article');
    expect(document.provenance.warnings).toEqual([]);
  });

  it('resolve --podcast-page still resolves the clip on a declared article', async () => {
    const { fetcher } = site(pages);
    const { io, stdout } = capture();
    const code = await run(['resolve', PAGE_URL, '--podcast-page', '--json'], io, {
      resolve: { fetcher },
    });
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.mediaUrl).toBe('https://publisher.example/media/clip.mp3');
  });

  it('resolve without a flag reports that the page declares an article', async () => {
    const { fetcher } = site(pages);
    const { io, stdout, stderr } = capture();
    const code = await run(['resolve', PAGE_URL, '--json'], io, { resolve: { fetcher } });
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('declares an article');
  });
});

import { describe, expect, it } from 'vitest';
import type { HttpFetcher, ItemAdapter, NormalizedDocument, Transcriber } from '@owlieio/core';
import { ConfigurationError, NotHandledError } from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { GenericEpisodePageResolver, PodcastAdapter } from '@owlieio/adapter-podcast';
import { extractWithFallback, selectItemAdapter } from 'owlie';

function adapter(id: string, recognize: (url: string) => boolean): ItemAdapter {
  return {
    id,
    sourceType: 'article',
    recognize: (locator) => recognize(locator.url),
    async extract(): Promise<NormalizedDocument> {
      throw new Error('not implemented in dispatch test');
    },
  };
}

function fallbackAdapter(
  id: string,
  behavior: { recognize?: boolean; defer?: boolean; text?: string } = {},
): ItemAdapter {
  return {
    id,
    sourceType: 'article',
    recognize: () => behavior.recognize ?? true,
    async resolveItem(locator) {
      if (behavior.defer) throw new NotHandledError(`${id}: not handled`);
      return {
        id: `${id}:${locator.url}`,
        sourceType: 'article',
        canonicalUrl: locator.url,
        metadata: {},
      };
    },
    async extract(item): Promise<NormalizedDocument> {
      return {
        schemaVersion: 1,
        id: item.id,
        sourceType: 'article',
        canonicalUrl: item.canonicalUrl,
        mediaType: 'text',
        text: behavior.text ?? `${id} text`,
        metadata: {},
      };
    },
  };
}

describe('selectItemAdapter', () => {
  it('selects the first adapter whose recognize() matches (specialized-first precedence)', () => {
    const youtube = adapter('youtube', (url) => url.includes('youtube.com'));
    const article = adapter('article', (url) => url.startsWith('https://'));
    const adapters = [youtube, article];

    expect(selectItemAdapter(adapters, { url: 'https://www.youtube.com/watch?v=abc' })?.id).toBe(
      'youtube',
    );
    expect(selectItemAdapter(adapters, { url: 'https://example.com/story' })?.id).toBe('article');
  });

  it('returns undefined when no adapter recognizes the locator', () => {
    const article = adapter('article', (url) => url.startsWith('https://'));
    expect(selectItemAdapter([article], { url: 'ftp://example.com/x' })).toBeUndefined();
  });

  it('does not fall through to later adapters once one matches', () => {
    const first = adapter('first', () => true);
    const second = adapter('second', () => true);
    expect(selectItemAdapter([first, second], { url: 'https://example.com/x' })?.id).toBe('first');
  });
});

describe('extractWithFallback', () => {
  it('returns the first adapter that resolves and extracts the locator', async () => {
    const { document } = await extractWithFallback(
      [fallbackAdapter('podcast', { defer: true }), fallbackAdapter('article')],
      { url: 'https://example.com/story' },
    );
    expect(document.text).toBe('article text');
  });

  it('falls back to the next adapter and reports the deferral', async () => {
    const fallbacks: string[] = [];
    const { document } = await extractWithFallback(
      [fallbackAdapter('podcast', { defer: true }), fallbackAdapter('article')],
      { url: 'https://example.com/story' },
      { onFallback: (error) => fallbacks.push(error.message) },
    );
    expect(document.text).toBe('article text');
    expect(fallbacks).toEqual(['podcast: not handled']);
  });

  it('rethrows the deferred error when every candidate defers', async () => {
    await expect(
      extractWithFallback([fallbackAdapter('podcast', { defer: true })], {
        url: 'https://example.com/story',
      }),
    ).rejects.toThrow('podcast: not handled');
  });

  it('propagates a non-deferral error without falling back', async () => {
    const failing: ItemAdapter = {
      id: 'podcast',
      sourceType: 'podcast',
      recognize: () => true,
      async resolveItem() {
        throw new Error('network down');
      },
      async extract() {
        throw new Error('unreachable');
      },
    };
    await expect(
      extractWithFallback([failing, fallbackAdapter('article')], {
        url: 'https://example.com/story',
      }),
    ).rejects.toThrow('network down');
  });

  it('throws when no adapter recognizes the locator', async () => {
    await expect(
      extractWithFallback([fallbackAdapter('article', { recognize: false })], {
        url: 'ftp://example.com/x',
      }),
    ).rejects.toThrow(ConfigurationError);
  });

  it('hands an already-fetched response to a fallback adapter instead of re-fetching', async () => {
    let articleFetchCount = 0;
    const deferredResponse = {
      url: 'https://example.com/story',
      contentType: 'text/html',
      text: '<p>article body</p>',
    };
    const podcast: ItemAdapter = {
      id: 'podcast',
      sourceType: 'podcast',
      recognize: () => true,
      async resolveItem() {
        throw new NotHandledError('podcast: not handled', { deferredResponse });
      },
      async extract() {
        throw new Error('unreachable');
      },
    };
    const article: ItemAdapter & {
      extractDeferred: (
        item: NormalizedDocument,
        response: typeof deferredResponse,
      ) => Promise<NormalizedDocument>;
    } = {
      id: 'article',
      sourceType: 'article',
      recognize: () => true,
      async resolveItem(locator) {
        return {
          id: 'article:x',
          sourceType: 'article' as const,
          canonicalUrl: locator.url,
          metadata: {},
        };
      },
      async extract() {
        articleFetchCount += 1;
        return {
          schemaVersion: 1 as const,
          id: 'article:x',
          sourceType: 'article' as const,
          canonicalUrl: 'https://example.com/story',
          mediaType: 'text' as const,
          text: 'fetched',
          metadata: {},
        };
      },
      async extractDeferred(_item, response) {
        return {
          schemaVersion: 1 as const,
          id: 'article:x',
          sourceType: 'article' as const,
          canonicalUrl: response.url,
          mediaType: 'text' as const,
          text: response.text,
          metadata: {},
        };
      },
    };

    const { document } = await extractWithFallback([podcast, article], {
      url: 'https://example.com/story',
    });

    expect(document.text).toBe('<p>article body</p>');
    expect(document.canonicalUrl).toBe('https://example.com/story');
    expect(articleFetchCount).toBe(0);
  });

  it('fetches an article page once when the podcast resolver defers', async () => {
    const ARTICLE_HTML = `<!doctype html>
<html>
  <head><title>A useful article title</title></head>
  <body>
    <main>
      <article>
        <h1>A useful article title</h1>
        <p>This is a deliberately substantial first paragraph of editorial prose. It explains the topic in ordinary language and contains enough independent words for article extraction to distinguish it from a navigation menu or decorative page chrome.</p>
        <p>This second paragraph continues the article with concrete detail, context, and a conclusion.</p>
      </article>
    </main>
  </body>
</html>`;
    let fetches = 0;
    const countingFetcher: HttpFetcher = {
      async fetch(url) {
        fetches += 1;
        return { url, contentType: 'text/html', text: ARTICLE_HTML };
      },
    };
    const fakeTranscriber: Transcriber = {
      id: 'fake',
      async transcribe(input) {
        return { text: 'unused', metadata: input.metadata };
      },
    };
    const podcast = new PodcastAdapter({
      fetcher: countingFetcher,
      transcriber: fakeTranscriber,
      cacheDir: '/tmp/owlie-cache',
      resolvers: [new GenericEpisodePageResolver({ fetcher: countingFetcher })],
    });
    const article = new ArticleAdapter({ fetcher: countingFetcher });

    const { document } = await extractWithFallback([podcast, article], {
      url: 'https://example.com/story',
    });

    expect(fetches).toBe(1);
    expect(document.sourceType).toBe('article');
    expect(document.canonicalUrl).toBe('https://example.com/story');
    expect(document.text).toContain('first paragraph');
  });
});

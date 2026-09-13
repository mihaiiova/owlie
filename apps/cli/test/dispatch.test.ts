import { describe, expect, it } from 'vitest';
import type { ItemAdapter, NormalizedDocument } from '@owlieio/core';
import { ConfigurationError, NotHandledError } from '@owlieio/core';
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
});

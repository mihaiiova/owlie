import { describe, expect, it } from 'vitest';
import type { ItemAdapter, NormalizedDocument } from '@owlieio/core';
import { selectItemAdapter } from 'owlie';

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

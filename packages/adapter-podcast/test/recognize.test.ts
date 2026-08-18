import { describe, expect, it } from 'vitest';
import { PodcastAdapter, recognizePodcastUrl } from '@owlieio/adapter-podcast';

describe('recognizePodcastUrl', () => {
  it('recognizes audio file URLs', () => {
    expect(recognizePodcastUrl('https://cdn.example.com/episodes/1.mp3')).toBe(true);
    expect(recognizePodcastUrl('https://cdn.example.com/episodes/1.m4a')).toBe(true);
  });

  it('rejects non-media URLs', () => {
    expect(recognizePodcastUrl('https://example.com/episode')).toBe(false);
    expect(recognizePodcastUrl('not a url')).toBe(false);
  });
});

describe('PodcastAdapter', () => {
  it('recognizes podcast locators (URL or hint)', () => {
    const adapter = new PodcastAdapter();
    expect(adapter.recognize({ url: 'https://cdn.example.com/1.mp3' })).toBe(true);
    expect(adapter.recognize({ url: 'https://example.com/episode', hint: 'podcast' })).toBe(true);
  });

  it('resolves a podcast item with a stable identity', async () => {
    const adapter = new PodcastAdapter();
    const item = await adapter.resolveItem({ url: 'https://cdn.example.com/1.mp3' });
    expect(item?.sourceType).toBe('podcast');
    expect(item?.id).toContain('podcast:episode:');
  });
});

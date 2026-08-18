import { describe, expect, it } from 'vitest';
import {
  isPlaylistUrl,
  isVideoUrl,
  recognizeYouTubeUrl,
  YouTubeAdapter,
} from '@owlieio/adapter-youtube';

describe('recognizeYouTubeUrl', () => {
  it('recognizes youtube.com and youtu.be URLs', () => {
    expect(recognizeYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(recognizeYouTubeUrl('https://youtu.be/abc123')).toBe(true);
    expect(recognizeYouTubeUrl('https://m.youtube.com/watch?v=abc123')).toBe(true);
  });

  it('rejects non-YouTube URLs', () => {
    expect(recognizeYouTubeUrl('https://example.com/watch?v=abc123')).toBe(false);
    expect(recognizeYouTubeUrl('not a url')).toBe(false);
    expect(recognizeYouTubeUrl('ftp://youtube.com/watch')).toBe(false);
  });
});

describe('isPlaylistUrl / isVideoUrl', () => {
  it('distinguishes playlists from videos', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PL123')).toBe(true);
    expect(isVideoUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isVideoUrl('https://youtu.be/abc123')).toBe(true);
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=abc123')).toBe(false);
    expect(isVideoUrl('https://www.youtube.com/playlist?list=PL123')).toBe(false);
  });
});

describe('YouTubeAdapter', () => {
  it('recognizes YouTube locators', () => {
    const adapter = new YouTubeAdapter();
    expect(adapter.recognize({ url: 'https://www.youtube.com/watch?v=abc123' })).toBe(true);
  });

  it('resolves a playlist collection with a stable identity', async () => {
    const adapter = new YouTubeAdapter();
    const collection = await adapter.resolve({
      url: 'https://www.youtube.com/playlist?list=PL123',
    });
    expect(collection.id).toBe('youtube:playlist:PL123');
    expect(collection.sourceType).toBe('youtube');
  });

  it('resolves a video item with a stable identity', async () => {
    const adapter = new YouTubeAdapter();
    const item = await adapter.resolveItem({ url: 'https://www.youtube.com/watch?v=abc123' });
    expect(item?.id).toBe('youtube:video:abc123');
  });

  it('rejects resolving a non-playlist URL as a collection', async () => {
    const adapter = new YouTubeAdapter();
    await expect(
      adapter.resolve({ url: 'https://www.youtube.com/watch?v=abc123' }),
    ).rejects.toThrow();
  });
});

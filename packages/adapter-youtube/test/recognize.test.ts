import { describe, expect, it } from 'vitest';
import {
  isPlaylistUrl,
  isVideoUrl,
  recognizeYouTubeUrl,
  YouTubeAdapter,
} from '@owlieio/adapter-youtube';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('recognizeYouTubeUrl', () => {
  it('recognizes youtube.com and youtu.be URLs', () => {
    expect(recognizeYouTubeUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true);
    expect(recognizeYouTubeUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(true);
    expect(recognizeYouTubeUrl(`https://m.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true);
    expect(recognizeYouTubeUrl(`https://music.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true);
  });

  it('rejects non-YouTube URLs', () => {
    expect(recognizeYouTubeUrl(`https://example.com/watch?v=${VIDEO_ID}`)).toBe(false);
    expect(recognizeYouTubeUrl('not a url')).toBe(false);
    expect(recognizeYouTubeUrl('ftp://youtube.com/watch')).toBe(false);
  });
});

describe('isPlaylistUrl / isVideoUrl', () => {
  it('distinguishes playlists from videos', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PL1234567890')).toBe(true);
    expect(isVideoUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true);
    expect(isVideoUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(true);
    expect(isPlaylistUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(false);
    expect(isVideoUrl('https://www.youtube.com/playlist?list=PL1234567890')).toBe(false);
  });

  it('rejects malformed video URLs', () => {
    expect(isVideoUrl('https://www.youtube.com/watch')).toBe(false);
    expect(isVideoUrl('https://www.youtube.com/watch?v=short')).toBe(false);
    expect(isVideoUrl('https://youtu.be/')).toBe(false);
  });
});

describe('YouTubeAdapter', () => {
  it('recognizes YouTube locators', () => {
    const adapter = new YouTubeAdapter();
    expect(adapter.recognize({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` })).toBe(true);
  });

  it('resolves a playlist collection with a stable identity', async () => {
    const adapter = new YouTubeAdapter();
    const collection = await adapter.resolve({
      url: 'https://www.youtube.com/playlist?list=PL1234567890',
    });
    expect(collection.id).toBe('youtube:playlist:PL1234567890');
    expect(collection.sourceType).toBe('youtube');
  });

  it('resolves a video item with a stable identity and canonical URL', async () => {
    const adapter = new YouTubeAdapter();
    const item = await adapter.resolveItem({ url: `https://youtu.be/${VIDEO_ID}` });
    expect(item?.id).toBe(`youtube:video:${VIDEO_ID}`);
    expect(item?.canonicalUrl).toBe(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  });

  it('rejects resolving a non-playlist URL as a collection', async () => {
    const adapter = new YouTubeAdapter();
    await expect(
      adapter.resolve({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` }),
    ).rejects.toThrow();
  });
});

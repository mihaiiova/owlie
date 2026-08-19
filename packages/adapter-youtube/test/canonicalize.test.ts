import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@owlieio/core';
import { canonicalizeVideoUrl, extractVideoId, YouTubeAdapter } from '@owlieio/adapter-youtube';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('extractVideoId', () => {
  it('extracts a valid ID from watch URLs', () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractVideoId(`https://m.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractVideoId(`https://music.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it('extracts a valid ID from youtu.be short links', () => {
    expect(extractVideoId(`https://youtu.be/${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it('ignores extra query params on watch URLs', () => {
    expect(
      extractVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}&list=PL1234567890&t=30`),
    ).toBe(VIDEO_ID);
  });

  it('returns null for malformed IDs', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/watch?v=123456789012')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/watch?v=abcde!hijkl')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/watch')).toBeNull();
    expect(extractVideoId('https://youtu.be/')).toBeNull();
  });

  it('returns null for unsupported YouTube URL forms', () => {
    expect(extractVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId(`https://www.youtube.com/live/${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId(`https://www.youtube.com/v/${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId('https://www.youtube.com/playlist?list=PL1234567890')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/@somechannel')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/results?search_query=foo')).toBeNull();
  });

  it('returns null for non-YouTube URLs', () => {
    expect(extractVideoId(`https://example.com/watch?v=${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId('not a url')).toBeNull();
  });
});

describe('canonicalizeVideoUrl', () => {
  it('canonicalizes supported forms to https://www.youtube.com/watch?v=<id>', () => {
    expect(canonicalizeVideoUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    );
    expect(canonicalizeVideoUrl(`https://m.youtube.com/watch?v=${VIDEO_ID}&t=30`)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    );
  });

  it('throws for unsupported or malformed URLs', () => {
    expect(() =>
      canonicalizeVideoUrl('https://www.youtube.com/playlist?list=PL1234567890'),
    ).toThrow(ConfigurationError);
    expect(() => canonicalizeVideoUrl('https://example.com/watch?v=x')).toThrow(ConfigurationError);
  });
});

describe('YouTubeAdapter.resolveItem', () => {
  it('returns a stable identity and canonical URL', async () => {
    const adapter = new YouTubeAdapter();
    const item = await adapter.resolveItem({ url: `https://youtu.be/${VIDEO_ID}` });
    expect(item).toMatchObject({
      id: `youtube:video:${VIDEO_ID}`,
      sourceType: 'youtube',
      canonicalUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    });
    expect(item.metadata).toMatchObject({ videoId: VIDEO_ID, platform: 'youtube' });
  });

  it('throws for unsupported YouTube URLs', async () => {
    const adapter = new YouTubeAdapter();
    await expect(
      adapter.resolveItem({ url: 'https://www.youtube.com/playlist?list=PL1234567890' }),
    ).rejects.toThrow(ConfigurationError);
    await expect(
      adapter.resolveItem({ url: 'https://www.youtube.com/watch?v=short' }),
    ).rejects.toThrow(ConfigurationError);
  });
});

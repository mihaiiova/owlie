import { describe, expect, it } from 'vitest';
import { extractVideoId, YouTubeAdapter } from '@owlieio/adapter-youtube';

/**
 * Live YouTube extraction test. Requires `OWLIE_LIVE_TESTS=1` and network
 * access to YouTube. Skipped in the default suite (see `vitest.config.ts`
 * exclusion) and unless the env gate is set. The default video ("Me at the
 * zoo") has stable auto-generated English captions; override with
 * `OWLIE_LIVE_YOUTUBE_URL`.
 */
const liveEnabled = process.env.OWLIE_LIVE_TESTS === '1';
const videoUrl =
  process.env.OWLIE_LIVE_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

describe.skipIf(!liveEnabled)('youtube live extraction', () => {
  it('extracts a non-empty transcript with metadata', async () => {
    const adapter = new YouTubeAdapter();
    const item = await adapter.resolveItem({ url: videoUrl });
    const document = await adapter.extract(item);

    expect(document.mediaType).toBe('transcript');
    expect(document.text.trim().length).toBeGreaterThan(0);
    expect(document.metadata.videoId).toBe(extractVideoId(videoUrl));
    expect(typeof document.metadata.isGenerated).toBe('boolean');
  }, 120_000);
});

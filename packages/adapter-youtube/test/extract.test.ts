import { describe, expect, it } from 'vitest';
import { CancelledError, CaptionsUnavailableError, ExtractionError } from '@owlieio/core';
import type { ContentItem, ProgressEvent } from '@owlieio/core';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import type { TranscriptClient, TranscriptPayload } from '@owlieio/adapter-youtube';

const VIDEO_ID = 'dQw4w9WgXcQ';

function makeItem(): ContentItem {
  return {
    id: `youtube:video:${VIDEO_ID}`,
    sourceType: 'youtube',
    canonicalUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    metadata: { videoId: VIDEO_ID, platform: 'youtube' },
  };
}

function makeClient(
  behavior: { payload?: TranscriptPayload; error?: unknown } = {},
): TranscriptClient {
  return {
    async fetch() {
      if (behavior.error) throw behavior.error;
      return (
        behavior.payload ?? {
          videoId: VIDEO_ID,
          transcript: 'hello world',
          language: 'English',
          languageCode: 'en',
          isGenerated: false,
        }
      );
    },
  };
}

describe('YouTubeAdapter.extract', () => {
  it('returns a normalized transcript document with no title', async () => {
    const adapter = new YouTubeAdapter({ client: makeClient() });
    const document = await adapter.extract(makeItem());
    expect(document.schemaVersion).toBe(1);
    expect(document.mediaType).toBe('transcript');
    expect(document.text).toBe('hello world');
    expect(document.title).toBeUndefined();
    expect(document.metadata).toMatchObject({
      videoId: VIDEO_ID,
      language: 'English',
      languageCode: 'en',
      isGenerated: false,
    });
  });

  it('passes the configured languages to the client', async () => {
    let received: string[] | undefined;
    const client: TranscriptClient = {
      async fetch(_id, options) {
        received = options?.languages;
        return {
          videoId: VIDEO_ID,
          transcript: 'x',
          language: 'de',
          languageCode: 'de',
          isGenerated: false,
        };
      },
    };
    const adapter = new YouTubeAdapter({ client, languages: ['de', 'en'] });
    await adapter.extract(makeItem());
    expect(received).toEqual(['de', 'en']);
  });

  it('surfaces captions-unavailable', async () => {
    const adapter = new YouTubeAdapter({
      client: makeClient({ error: new CaptionsUnavailableError('none') }),
    });
    await expect(adapter.extract(makeItem())).rejects.toBeInstanceOf(CaptionsUnavailableError);
  });

  it('propagates cancellation', async () => {
    const adapter = new YouTubeAdapter({
      client: makeClient({ error: new CancelledError('cancelled') }),
    });
    await expect(adapter.extract(makeItem())).rejects.toBeInstanceOf(CancelledError);
  });

  it('rejects an item missing a videoId', async () => {
    const adapter = new YouTubeAdapter({ client: makeClient() });
    const item = makeItem();
    item.metadata = {};
    await expect(adapter.extract(item)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('emits started and completed progress events', async () => {
    const events: ProgressEvent[] = [];
    const adapter = new YouTubeAdapter({ client: makeClient() });
    await adapter.extract(makeItem(), { progress: { emit: (event) => events.push(event) } });
    expect(events[0]).toMatchObject({ type: 'started' });
    expect(events[events.length - 1]).toMatchObject({ type: 'completed' });
  });
});

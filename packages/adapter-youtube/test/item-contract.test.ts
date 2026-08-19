import { itemAdapterContract } from '@owlieio/testing/contract-tests';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import type { TranscriptClient } from '@owlieio/adapter-youtube';

const client: TranscriptClient = {
  async fetch(videoId) {
    return {
      videoId,
      transcript: 'hello world',
      language: 'English',
      languageCode: 'en',
      isGenerated: false,
    };
  },
};

itemAdapterContract('youtube', () => new YouTubeAdapter({ client }), {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
});

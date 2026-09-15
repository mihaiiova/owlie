import { describe, expect, it } from 'vitest';
import { ExtractionError } from '@owlieio/core';
import { DirectMediaResolver } from '@owlieio/adapter-podcast';

describe('DirectMediaResolver.resolve', () => {
  it('validates and returns the media URL', async () => {
    const resolver = new DirectMediaResolver();
    const result = await resolver.resolve({ url: 'https://cdn.example.com/episode.mp3' });
    expect(result.mediaUrl).toBe('https://cdn.example.com/episode.mp3');
  });

  it('rejects a credential-bearing media URL without exposing the secret', async () => {
    const resolver = new DirectMediaResolver();
    await expect(
      resolver.resolve({ url: 'https://alice:direct-secret@cdn.example.com/episode.mp3' }),
    ).rejects.toThrow(ExtractionError);
  });

  it('rejects an unsafe destination host', async () => {
    const resolver = new DirectMediaResolver();
    await expect(resolver.resolve({ url: 'https://localhost/episode.mp3' })).rejects.toThrow(
      'disallowed host',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { RequestBlocked } from '@hallelx/youtube-transcript';
import { CancelledError, CaptionsUnavailableError, ExtractionError } from '@owlieio/core';
import { pickTranscript, YouTubeTranscriptClient } from '@owlieio/adapter-youtube';
import type { FetchedTrack, TranscriptSource, TranscriptTrack } from '@owlieio/adapter-youtube';

function track(languageCode: string, isGenerated: boolean): TranscriptTrack {
  return { languageCode, isGenerated };
}

describe('pickTranscript', () => {
  it('prefers manual English over non-English manual', () => {
    const result = pickTranscript([track('ro', false), track('en', false)], ['en']);
    expect(result?.languageCode).toBe('en');
    expect(result?.isGenerated).toBe(false);
  });

  it('prefers manual English over generated English', () => {
    const result = pickTranscript([track('en', true), track('en', false)], ['en']);
    expect(result?.languageCode).toBe('en');
    expect(result?.isGenerated).toBe(false);
  });

  it('prefers generated English when no manual English', () => {
    const result = pickTranscript([track('ro', false), track('en', true)], ['en']);
    expect(result?.languageCode).toBe('en');
    expect(result?.isGenerated).toBe(true);
  });

  it('falls back to first manual when no requested language', () => {
    const result = pickTranscript([track('ro', false), track('fr', false)], ['en']);
    expect(result?.languageCode).toBe('ro');
    expect(result?.isGenerated).toBe(false);
  });

  it('falls back to first generated when no manual', () => {
    const result = pickTranscript([track('ro', true), track('fr', true)], ['en']);
    expect(result?.languageCode).toBe('ro');
    expect(result?.isGenerated).toBe(true);
  });

  it('treats regional codes as matching the base language', () => {
    const result = pickTranscript([track('ro', false), track('en-US', false)], ['en']);
    expect(result?.languageCode).toBe('en-US');
  });

  it('respects language priority order', () => {
    const result = pickTranscript([track('en', false), track('de', false)], ['de', 'en']);
    expect(result?.languageCode).toBe('de');
  });

  it('returns null when no transcripts', () => {
    expect(pickTranscript([], ['en'])).toBeNull();
  });
});

function makeTrack(languageCode: string, isGenerated: boolean, text: string): FetchedTrack {
  return {
    languageCode,
    language: languageCode.toUpperCase(),
    isGenerated,
    async fetch() {
      return { snippets: [{ text }] };
    },
  };
}

function sourceOf(tracks: FetchedTrack[], listError?: unknown): TranscriptSource {
  return {
    async list() {
      if (listError) throw listError;
      return tracks;
    },
  };
}

describe('YouTubeTranscriptClient.fetch', () => {
  it('returns the selected transcript payload', async () => {
    const client = new YouTubeTranscriptClient({
      source: sourceOf([makeTrack('en', false, 'hello world')]),
    });
    const payload = await client.fetch('videoId');
    expect(payload.transcript).toBe('hello world');
    expect(payload.languageCode).toBe('en');
    expect(payload.isGenerated).toBe(false);
  });

  it('throws CaptionsUnavailableError when no tracks exist', async () => {
    const client = new YouTubeTranscriptClient({ source: sourceOf([]) });
    await expect(client.fetch('id')).rejects.toBeInstanceOf(CaptionsUnavailableError);
  });

  it('throws CaptionsUnavailableError on an empty transcript', async () => {
    const client = new YouTubeTranscriptClient({
      source: sourceOf([makeTrack('en', false, '   ')]),
    });
    await expect(client.fetch('id')).rejects.toBeInstanceOf(CaptionsUnavailableError);
  });

  it('maps an abort error to CancelledError', async () => {
    const client = new YouTubeTranscriptClient({
      source: sourceOf([], Object.assign(new Error('aborted'), { name: 'AbortError' })),
    });
    await expect(client.fetch('id')).rejects.toBeInstanceOf(CancelledError);
  });

  it('maps other failures to ExtractionError', async () => {
    const client = new YouTubeTranscriptClient({ source: sourceOf([], new Error('boom')) });
    await expect(client.fetch('id')).rejects.toBeInstanceOf(ExtractionError);
  });

  it('maps a blocked request to a proxy-setup hint', async () => {
    const client = new YouTubeTranscriptClient({
      source: sourceOf([], new RequestBlocked('videoId')),
    });
    await expect(client.fetch('id')).rejects.toBeInstanceOf(ExtractionError);
    await expect(client.fetch('id')).rejects.toThrow(/owlie setup/);
  });

  it('honors a per-call language override', async () => {
    const client = new YouTubeTranscriptClient({
      source: sourceOf([makeTrack('de', false, 'guten tag')]),
    });
    const payload = await client.fetch('id', { languages: ['de'] });
    expect(payload.languageCode).toBe('de');
  });
});

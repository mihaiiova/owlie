import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '@owlieio/core';
import {
  DEFAULT_WHISPER_COMPUTE_TYPE,
  DEFAULT_WHISPER_LANGUAGE,
  DEFAULT_WHISPER_MODEL,
  WhisperLocalTranscriber,
} from '@owlieio/provider-whisper';

describe('whisper defaults', () => {
  it('documents the intended default model, language, and compute type', () => {
    expect(DEFAULT_WHISPER_MODEL).toBe('small');
    expect(DEFAULT_WHISPER_LANGUAGE).toBe('auto');
    expect(DEFAULT_WHISPER_COMPUTE_TYPE).toBe('int8');
  });
});

describe('WhisperLocalTranscriber', () => {
  it('is a non-functional scaffold', async () => {
    const transcriber = new WhisperLocalTranscriber();
    expect(transcriber.id).toBe('whisper-local');
    await expect(
      transcriber.transcribe({ mediaUrl: 'https://example.com/a.mp3', metadata: {} }),
    ).rejects.toThrow(NotImplementedError);
  });
});

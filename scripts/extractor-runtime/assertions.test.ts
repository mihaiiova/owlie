import { describe, expect, it } from 'vitest';

import {
  assertDoctorReport,
  assertNoModelDownloadGuidance,
  assertPrerequisiteGuidance,
  assertRuntimePrerequisitesClear,
  assertTranscriptionDetected,
  assertTranscriptDocument,
  MODEL_DOWNLOAD_GUIDANCE,
  PREREQUISITE_GUIDANCE,
} from './assertions.mjs';

describe('assertDoctorReport', () => {
  const base = {
    node: 'v20.0.0',
    platform: 'linux',
    arch: 'x64',
    adapters: ['youtube', 'podcast', 'rss', 'article'],
    providers: [
      { id: 'deepseek', apiKey: 'not set', model: 'not set' },
      { id: 'openai', apiKey: 'not set', model: 'not set' },
    ],
    transcription: { whisper: 'detected', ffmpeg: 'detected', ffprobe: 'detected', model: 'set' },
  };

  it('accepts a complete report', () => {
    expect(assertDoctorReport(base).ok).toBe(true);
  });

  it('rejects a missing functional adapter', () => {
    const report = { ...base, adapters: ['youtube', 'rss', 'article'] };
    expect(assertDoctorReport(report).ok).toBe(false);
  });

  it('rejects a missing transcription field', () => {
    const report = { ...base, transcription: { whisper: 'detected', ffmpeg: 'detected' } };
    expect(assertDoctorReport(report).ok).toBe(false);
  });

  it('rejects non-object output', () => {
    expect(assertDoctorReport(null).ok).toBe(false);
    expect(assertDoctorReport([]).ok).toBe(false);
  });
});

describe('assertTranscriptionDetected', () => {
  it('accepts a fully detected runtime', () => {
    expect(
      assertTranscriptionDetected({
        whisper: 'detected',
        ffmpeg: 'detected',
        ffprobe: 'detected',
        model: 'set',
      }).ok,
    ).toBe(true);
  });

  it('rejects a missing prerequisite', () => {
    expect(
      assertTranscriptionDetected({
        whisper: 'not detected',
        ffmpeg: 'detected',
        ffprobe: 'detected',
        model: 'set',
      }).ok,
    ).toBe(false);
  });
});

describe('assertTranscriptDocument', () => {
  const base = {
    schemaVersion: 1,
    id: 'podcast:episode:https://example.com/a.wav',
    sourceType: 'podcast',
    canonicalUrl: 'https://example.com/a.wav',
    mediaType: 'transcript',
    text: 'hello',
    metadata: {},
  };

  it('accepts a valid transcript document', () => {
    expect(assertTranscriptDocument(base).ok).toBe(true);
  });

  it('rejects the wrong media type', () => {
    expect(assertTranscriptDocument({ ...base, mediaType: 'text' }).ok).toBe(false);
  });

  it('rejects empty transcript text', () => {
    expect(assertTranscriptDocument({ ...base, text: '  ' }).ok).toBe(false);
  });

  it('rejects a non-http canonicalUrl', () => {
    expect(assertTranscriptDocument({ ...base, canonicalUrl: 'file:///x' }).ok).toBe(false);
  });
});

describe('guidance assertions', () => {
  it('detects prerequisite installation guidance', () => {
    expect(
      assertPrerequisiteGuidance(
        'podcast extraction failed: ffprobe is not installed; install ffmpeg/ffprobe from your package manager',
      ).ok,
    ).toBe(true);
    expect(assertPrerequisiteGuidance('something else').ok).toBe(false);
  });

  it('detects no-model-download guidance', () => {
    expect(
      assertNoModelDownloadGuidance(
        'Whisper model "small" is unavailable locally; pre-provision it before extraction because Owlie never downloads model weights',
      ).ok,
    ).toBe(true);
    expect(assertNoModelDownloadGuidance('generic failure').ok).toBe(false);
  });

  it('exposes the guidance patterns as reusable regexes', () => {
    expect(PREREQUISITE_GUIDANCE).toBeInstanceOf(RegExp);
    expect(MODEL_DOWNLOAD_GUIDANCE).toBeInstanceOf(RegExp);
  });
});

describe('assertRuntimePrerequisitesClear', () => {
  it('passes when neither prerequisite nor model guidance is present', () => {
    expect(assertRuntimePrerequisitesClear('faster-whisper produced an empty transcript').ok).toBe(
      true,
    );
  });

  it('fails when prerequisite guidance is present', () => {
    expect(assertRuntimePrerequisitesClear('ffprobe is not installed').ok).toBe(false);
  });

  it('fails when model-download guidance is present', () => {
    expect(assertRuntimePrerequisitesClear('because Owlie never downloads model weights').ok).toBe(
      false,
    );
  });
});

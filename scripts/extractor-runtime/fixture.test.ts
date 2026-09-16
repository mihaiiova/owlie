import { describe, expect, it } from 'vitest';

import { audioEntryFromManifest, buildWavFixture, WAV_HEADER_BYTES } from './fixture.mjs';

describe('buildWavFixture', () => {
  it('produces a valid PCM16 mono WAV header', () => {
    const wav = buildWavFixture({ seconds: 1, sampleRate: 16000 });
    expect(wav.length).toBe(WAV_HEADER_BYTES + 16000 * 2);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    // PCM format, mono, 16-bit
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(24)).toBe(16000);
  });

  it('is deterministic for the same parameters', () => {
    expect(buildWavFixture()).toEqual(buildWavFixture());
  });

  it('sizes the payload from seconds and sample rate', () => {
    const wav = buildWavFixture({ seconds: 0.5, sampleRate: 8000 });
    expect(wav.length).toBe(WAV_HEADER_BYTES + 8000 * 0.5 * 2);
  });

  it('clamps to at least one sample', () => {
    const wav = buildWavFixture({ seconds: 0, sampleRate: 8000 });
    expect(wav.length).toBe(WAV_HEADER_BYTES + 2);
  });
});

describe('audioEntryFromManifest', () => {
  it('extracts a valid audio entry', () => {
    const result = audioEntryFromManifest(
      JSON.stringify({ audio: { path: 'audio.wav', contentType: 'audio/wav' } }),
    );
    expect(result.ok).toBe(true);
    expect(result.entry).toEqual({ path: 'audio.wav', contentType: 'audio/wav' });
  });

  it('rejects a missing audio entry', () => {
    expect(audioEntryFromManifest(JSON.stringify({})).ok).toBe(false);
  });

  it('rejects a non-allowlisted audio extension', () => {
    const result = audioEntryFromManifest(JSON.stringify({ audio: { path: 'audio.txt' } }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/allowlisted audio extension/);
  });

  it('rejects invalid manifest JSON', () => {
    expect(audioEntryFromManifest('{oops').ok).toBe(false);
  });
});

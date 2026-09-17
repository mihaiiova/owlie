import { describe, expect, it } from 'vitest';

import { buildRealScenarios, buildShimScenarios } from './scenarios.mjs';
import { TRANSCRIPT_TEXT } from './runtime-behavior.cjs';

const MEDIA_URL = 'https://example.com/episode.wav';

function result(overrides = {}) {
  return { status: 0, stdout: '', stderr: '', signal: null, error: null, ...overrides };
}

describe('buildShimScenarios', () => {
  const scenarios = buildShimScenarios({ mediaUrl: MEDIA_URL });
  const byName = Object.fromEntries(scenarios.map((s) => [s.name, s]));

  it('builds the four installed-executable scenarios', () => {
    expect(scenarios.map((s) => s.name)).toEqual([
      'doctor --json (shimmed runtime)',
      'extract direct-media --json (shimmed runtime)',
      'extract missing ffprobe -> prerequisite guidance',
      'extract missing model -> never downloads guidance',
    ]);
  });

  it('doctor accepts a complete report and detects the shimmed runtime', () => {
    const scenario = byName['doctor --json (shimmed runtime)'];
    const good = scenario.assert(
      result({
        stdout: JSON.stringify({
          node: 'v20.0.0',
          platform: 'linux',
          arch: 'x64',
          adapters: ['youtube', 'podcast', 'rss', 'article'],
          providers: [
            { id: 'deepseek', apiKey: 'not set', model: 'not set' },
            { id: 'openai', apiKey: 'not set', model: 'not set' },
          ],
          transcription: {
            whisper: 'detected',
            ffmpeg: 'detected',
            ffprobe: 'detected',
            model: 'not set',
          },
        }),
      }),
    );
    expect(good.ok).toBe(true);
  });

  it('doctor rejects a missing transcription prerequisite', () => {
    const scenario = byName['doctor --json (shimmed runtime)'];
    const bad = scenario.assert(
      result({
        status: 0,
        stdout: JSON.stringify({
          node: 'v20.0.0',
          platform: 'linux',
          arch: 'x64',
          adapters: ['youtube', 'podcast', 'rss', 'article'],
          providers: [],
          transcription: {
            whisper: 'not detected',
            ffmpeg: 'detected',
            ffprobe: 'detected',
            model: 'not set',
          },
        }),
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it('extract accepts a transcript document and flags text leaked to stderr', () => {
    const scenario = byName['extract direct-media --json (shimmed runtime)'];
    const doc = {
      schemaVersion: 1,
      id: `podcast:episode:${MEDIA_URL}`,
      sourceType: 'podcast',
      canonicalUrl: MEDIA_URL,
      mediaType: 'transcript',
      text: TRANSCRIPT_TEXT,
      metadata: {},
    };
    expect(scenario.assert(result({ stdout: JSON.stringify(doc) })).ok).toBe(true);
    expect(
      scenario.assert(result({ stdout: JSON.stringify(doc), stderr: `leak ${TRANSCRIPT_TEXT}` }))
        .ok,
    ).toBe(false);
  });

  it('prerequisite-guidance scenario requires exit 1, guidance, and empty stdout', () => {
    const scenario = byName['extract missing ffprobe -> prerequisite guidance'];
    const good = scenario.assert(
      result({
        status: 1,
        stderr:
          'podcast extraction failed: ffprobe is not installed; install ffmpeg/ffprobe from your package manager',
      }),
    );
    expect(good.ok).toBe(true);
    expect(scenario.assert(result({ status: 0 })).ok).toBe(false);
    expect(scenario.assert(result({ status: 1, stdout: '{...}' })).ok).toBe(false);
  });

  it('model-guidance scenario requires exit 1, guidance, and empty stdout', () => {
    const scenario = byName['extract missing model -> never downloads guidance'];
    expect(
      scenario.assert(
        result({ status: 1, stderr: 'Owlie never downloads model weights; pre-provision it' }),
      ).ok,
    ).toBe(true);
    expect(scenario.assert(result({ status: 1, stderr: 'other' })).ok).toBe(false);
  });
});

describe('buildRealScenarios', () => {
  const scenarios = buildRealScenarios({ mediaUrl: MEDIA_URL });

  it('builds the two gated real-runtime scenarios', () => {
    expect(scenarios.map((s) => s.name)).toEqual([
      'doctor --json (real runtime)',
      'extract direct-media --json (real runtime)',
    ]);
  });

  it('real doctor requires a detected runtime and a set model', () => {
    const [doctor] = scenarios;
    const good = doctor.assert(
      result({
        stdout: JSON.stringify({
          node: 'v20.0.0',
          platform: 'linux',
          arch: 'x64',
          adapters: ['youtube', 'podcast', 'rss', 'article'],
          providers: [
            { id: 'deepseek', apiKey: 'not set', model: 'not set' },
            { id: 'openai', apiKey: 'not set', model: 'not set' },
          ],
          transcription: {
            whisper: 'detected',
            ffmpeg: 'detected',
            ffprobe: 'detected',
            model: 'set',
          },
        }),
      }),
    );
    expect(good.ok).toBe(true);
    expect(
      doctor.assert(
        result({
          stdout: JSON.stringify({
            node: 'v20.0.0',
            platform: 'linux',
            arch: 'x64',
            adapters: ['youtube', 'podcast', 'rss', 'article'],
            providers: [],
            transcription: {
              whisper: 'detected',
              ffmpeg: 'detected',
              ffprobe: 'detected',
              model: 'not set',
            },
          }),
        }),
      ).ok,
    ).toBe(false);
  });

  it('real extract accepts a transcript document', () => {
    const extract = scenarios[1];
    expect(
      extract.assert(
        result({
          stdout: JSON.stringify({
            schemaVersion: 1,
            sourceType: 'podcast',
            canonicalUrl: MEDIA_URL,
            mediaType: 'transcript',
            text: 'actual speech',
            metadata: {},
          }),
        }),
      ).ok,
    ).toBe(true);
  });

  it('real extract accepts a non-prerequisite failure (empty transcript)', () => {
    const extract = scenarios[1];
    expect(
      extract.assert(result({ status: 1, stderr: 'faster-whisper produced an empty transcript' }))
        .ok,
    ).toBe(true);
  });

  it('real extract rejects a prerequisite or model failure', () => {
    const extract = scenarios[1];
    expect(
      extract.assert(
        result({
          status: 1,
          stderr: 'ffprobe is not installed',
        }),
      ).ok,
    ).toBe(false);
    expect(extract.assert(result({ status: 1, stderr: 'never downloads model weights' })).ok).toBe(
      false,
    );
  });
});

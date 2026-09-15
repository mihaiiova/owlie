import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CancelledError } from '@owlieio/core';
import { FakeProgressSink } from '@owlieio/testing';
import {
  WhisperLocalTranscriber,
  computeChunkRanges,
  mergeChunkTranscripts,
} from '@owlieio/provider-whisper';

describe('computeChunkRanges', () => {
  it('splits a long duration into overlapping five-minute chunks', () => {
    expect(computeChunkRanges(700)).toEqual([
      { start: 0, end: 300 },
      { start: 298, end: 598 },
      { start: 596, end: 700 },
    ]);
  });

  it('returns a single chunk at or below the chunk size', () => {
    expect(computeChunkRanges(300)).toEqual([{ start: 0, end: 300 }]);
    expect(computeChunkRanges(120)).toEqual([{ start: 0, end: 120 }]);
  });

  it('clamps the final chunk to the duration', () => {
    expect(computeChunkRanges(301)).toEqual([
      { start: 0, end: 300 },
      { start: 298, end: 301 },
    ]);
  });

  it('returns no chunks for non-positive durations', () => {
    expect(computeChunkRanges(0)).toEqual([]);
    expect(computeChunkRanges(Number.NaN)).toEqual([]);
  });
});

describe('mergeChunkTranscripts', () => {
  it('offsets segment times and trims the overlap tail', () => {
    const merged = mergeChunkTranscripts(
      [
        { text: 'zero', language: 'en', segments: [{ start: 295, end: 302, text: 'zero' }] },
        { text: 'one', language: 'en', segments: [{ start: 0, end: 5, text: 'one' }] },
      ],
      [
        { start: 0, end: 300 },
        { start: 298, end: 598 },
      ],
    );
    expect(merged.text).toBe('zero one');
    expect(merged.language).toBe('en');
    expect(merged.segments).toEqual([
      { start: 295, end: 298, text: 'zero' },
      { start: 298, end: 303, text: 'one' },
    ]);
  });

  it('drops a segment entirely inside the overlap tail', () => {
    const merged = mergeChunkTranscripts(
      [
        { text: 'zero', segments: [{ start: 299, end: 300, text: 'zero' }] },
        { text: 'one', segments: [{ start: 0, end: 1, text: 'one' }] },
      ],
      [
        { start: 0, end: 300 },
        { start: 298, end: 598 },
      ],
    );
    expect(merged.text).toBe('one');
    expect(merged.segments).toEqual([{ start: 298, end: 299, text: 'one' }]);
  });

  it('keeps the final chunk untrimmed', () => {
    const merged = mergeChunkTranscripts(
      [{ text: 'last', segments: [{ start: 0, end: 100, text: 'last' }] }],
      [{ start: 596, end: 700 }],
    );
    expect(merged.segments).toEqual([{ start: 596, end: 696, text: 'last' }]);
  });
});

describe('WhisperLocalTranscriber chunked transcription', () => {
  it('loads the model once and merges chunks with monotonic progress', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const transcriber = new WhisperLocalTranscriber({}, async (file, args, options) => {
      calls.push({ file, args });
      if (file === 'ffprobe') {
        return JSON.stringify({ format: { duration: '700.0' } });
      }
      if (file === 'python3') {
        options.onStdout?.('PROGRESS 1/3\n');
        options.onStdout?.('PROGRESS 2/3\n');
        options.onStdout?.('PROGRESS 3/3\n');
        await writeFile(
          args[2]!,
          JSON.stringify([
            {
              text: 'chunk zero',
              language: 'en',
              segments: [{ start: 0, end: 5, text: 'chunk zero' }],
            },
            {
              text: 'chunk one',
              language: 'en',
              segments: [{ start: 0, end: 5, text: 'chunk one' }],
            },
            {
              text: 'chunk two',
              language: 'en',
              segments: [{ start: 0, end: 5, text: 'chunk two' }],
            },
          ]),
        );
      }
      return '';
    });

    const progress = new FakeProgressSink();
    const result = await transcriber.transcribe(
      { mediaPath: '/tmp/audio.mp3', metadata: {} },
      { progress },
    );

    // Model loaded exactly once for the whole chunk run.
    expect(calls.filter((call) => call.file === 'python3')).toHaveLength(1);
    // One normalize pass plus one split pass per chunk.
    expect(calls.filter((call) => call.file === 'ffmpeg')).toHaveLength(4);
    expect(result.text).toBe('chunk zero chunk one chunk two');
    expect(result.segments).toEqual([
      { start: 0, end: 5, text: 'chunk zero' },
      { start: 298, end: 303, text: 'chunk one' },
      { start: 596, end: 601, text: 'chunk two' },
    ]);
    const progressEvents = progress.events.filter((event) => event.type === 'progress');
    expect(progressEvents.map((event) => event.current)).toEqual([1, 2, 3]);
  });

  it('rejects immediately with CancelledError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const transcriber = new WhisperLocalTranscriber({}, async () => '');
    await expect(
      transcriber.transcribe(
        { mediaPath: '/tmp/x.mp3', metadata: {} },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(CancelledError);
  });

  it('propagates mid-transcription cancellation as CancelledError', async () => {
    const controller = new AbortController();
    const transcriber = new WhisperLocalTranscriber({}, async (file) => {
      if (file === 'python3') {
        controller.abort();
        throw new CancelledError('transcription cancelled', {});
      }
      return '';
    });
    await expect(
      transcriber.transcribe(
        { mediaPath: '/tmp/x.mp3', metadata: {} },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(CancelledError);
  });
});

import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { transcriberContract } from '@owlieio/testing/contract-tests';
import { CancelledError } from '@owlieio/core';
import {
  DEFAULT_WHISPER_COMPUTE_TYPE,
  DEFAULT_WHISPER_LANGUAGE,
  DEFAULT_WHISPER_MODEL,
  runProcess,
  WhisperLocalTranscriber,
} from '@owlieio/provider-whisper';
import type { SubprocessRunner } from '@owlieio/provider-whisper';

const runner: SubprocessRunner = async (file, args, _options) => {
  if (file === 'ffprobe') return JSON.stringify({ format: { duration: '1' } });
  if (file === 'python3') {
    const output = args[2]!;
    await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
    await writeFile(
      output,
      JSON.stringify([
        {
          text: 'hello world',
          language: 'en',
          segments: [{ start: 0, end: 1, text: 'hello world' }],
        },
      ]),
    );
  }
  return '';
};

describe('whisper defaults', () => {
  it('uses the documented default model, language, and compute type', () => {
    expect(DEFAULT_WHISPER_MODEL).toBe('small');
    expect(DEFAULT_WHISPER_LANGUAGE).toBe('auto');
    expect(DEFAULT_WHISPER_COMPUTE_TYPE).toBe('int8');
  });
});

describe('runProcess', () => {
  it('terminates an active child when its signal aborts', async () => {
    const controller = new AbortController();
    let markReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const pending = runProcess(
      process.execPath,
      ['-e', "process.stdout.write('ready\\n'); setInterval(() => {}, 1_000)"],
      {
        signal: controller.signal,
        onStdout: (chunk) => {
          if (chunk.includes('ready')) markReady?.();
        },
      },
    );

    try {
      await ready;
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(CancelledError);
    } finally {
      controller.abort();
      await pending.catch(() => undefined);
    }
  });
});

describe('WhisperLocalTranscriber', () => {
  it('passes cancellation to the active subprocess runner', async () => {
    const controller = new AbortController();
    const transcriber = new WhisperLocalTranscriber(
      {},
      async (_file, _args, options) =>
        new Promise<string>((_resolve, reject) => {
          if (options.signal?.aborted) {
            reject(new CancelledError('subprocess cancelled'));
            return;
          }
          options.signal?.addEventListener(
            'abort',
            () => reject(new CancelledError('subprocess cancelled')),
            { once: true },
          );
        }),
    );
    const pending = transcriber.transcribe(
      { mediaPath: '/tmp/audio.mp3', metadata: {} },
      {
        signal: controller.signal,
      },
    );
    controller.abort();
    await expect(pending).rejects.toThrow('transcription cancelled');
  });

  it('rejects media that ffprobe cannot validate before transcoding', async () => {
    const calls: string[] = [];
    const transcriber = new WhisperLocalTranscriber({}, async (file) => {
      calls.push(file);
      if (file === 'ffprobe') return JSON.stringify({ format: {} });
      return '';
    });

    await expect(
      transcriber.transcribe({ mediaPath: '/tmp/not-really-audio.mp3', metadata: {} }),
    ).rejects.toThrow('not readable audio');
    expect(calls).toEqual(['ffprobe']);
  });

  it('maps a failed ffprobe command to a typed unreadable-media error', async () => {
    const transcriber = new WhisperLocalTranscriber({}, async (file) => {
      if (file === 'ffprobe') throw new Error('ffprobe exited with code 1');
      return '';
    });

    await expect(
      transcriber.transcribe({ mediaPath: '/tmp/not-really-audio.mp3', metadata: {} }),
    ).rejects.toThrow('not readable audio');
  });

  it('reports a missing ffprobe binary as a prerequisite failure, not unreadable media', async () => {
    const transcriber = new WhisperLocalTranscriber({}, async (file) => {
      if (file === 'ffprobe') {
        const error = new Error('spawn ffprobe ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        throw error;
      }
      return '';
    });

    await expect(
      transcriber.transcribe({ mediaPath: '/tmp/audio.mp3', metadata: {} }),
    ).rejects.toThrow('ensure');
  });

  it('guides operators to pre-provision a missing local model', async () => {
    const transcriber = new WhisperLocalTranscriber({}, async (file) => {
      if (file === 'ffprobe') return JSON.stringify({ format: { duration: '1' } });
      if (file === 'python3') throw new Error('OWLIE_MODEL_UNAVAILABLE: cache miss');
      return '';
    });

    await expect(
      transcriber.transcribe({ mediaPath: '/tmp/audio.mp3', metadata: {} }),
    ).rejects.toThrow('pre-provision');
  });

  it('runs tools with argument arrays and returns timing metadata', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const transcriber = new WhisperLocalTranscriber({}, async (file, args, options) => {
      calls.push({ file, args });
      return runner(file, args, options);
    });
    const result = await transcriber.transcribe({ mediaPath: '/tmp/audio.mp3', metadata: {} });
    expect(calls.map((call) => call.file)).toEqual(['ffprobe', 'ffmpeg', 'python3']);
    expect(calls[1]!.args).toContain('-ar');
    expect(calls[2]!.args).toContain('small');
    expect(calls[2]!.args[1]).toContain('local_files_only=True');
    expect(calls[2]!.args[1]).toContain('OWLIE_MODEL_UNAVAILABLE');
    expect(result).toMatchObject({
      text: 'hello world',
      language: 'en',
      metadata: { provider: 'whisper-local', model: 'small' },
    });
    expect(result.segments).toEqual([{ start: 0, end: 1, text: 'hello world' }]);
  });
});

transcriberContract('whisper-local', () => new WhisperLocalTranscriber({}, runner));

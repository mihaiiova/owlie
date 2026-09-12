import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { transcriberContract } from '@owlieio/testing/contract-tests';
import {
  DEFAULT_WHISPER_COMPUTE_TYPE,
  DEFAULT_WHISPER_LANGUAGE,
  DEFAULT_WHISPER_MODEL,
  WhisperLocalTranscriber,
} from '@owlieio/provider-whisper';

const runner = async (
  _file: string,
  args: readonly string[],
  _options: { signal?: AbortSignal },
) => {
  if (args[0] === '-c') {
    const output = args[3]!;
    await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
    await writeFile(
      output,
      JSON.stringify({
        text: 'hello world',
        language: 'en',
        segments: [{ start: 0, end: 1, text: 'hello world' }],
      }),
    );
  }
};

describe('whisper defaults', () => {
  it('uses the documented default model, language, and compute type', () => {
    expect(DEFAULT_WHISPER_MODEL).toBe('small');
    expect(DEFAULT_WHISPER_LANGUAGE).toBe('auto');
    expect(DEFAULT_WHISPER_COMPUTE_TYPE).toBe('int8');
  });
});

describe('WhisperLocalTranscriber', () => {
  it('runs tools with argument arrays and returns timing metadata', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const transcriber = new WhisperLocalTranscriber({}, async (file, args, options) => {
      calls.push({ file, args });
      await runner(file, args, options);
    });
    const result = await transcriber.transcribe({ mediaPath: '/tmp/audio.mp3', metadata: {} });
    expect(calls.map((call) => call.file)).toEqual(['ffprobe', 'ffmpeg', 'python3']);
    expect(calls[1]!.args).toContain('-ar');
    expect(calls[2]!.args).toContain('small');
    expect(result).toMatchObject({
      text: 'hello world',
      language: 'en',
      metadata: { provider: 'whisper-local', model: 'small' },
    });
    expect(result.segments).toEqual([{ start: 0, end: 1, text: 'hello world' }]);
  });
});

transcriberContract('whisper-local', () => new WhisperLocalTranscriber({}, runner));

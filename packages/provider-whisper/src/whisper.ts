import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  Transcriber,
  TranscriptionInput,
  TranscriptionOptions,
  TranscriptionResult,
} from '@owlieio/core';
import { CancelledError, ConfigurationError, TranscriptionError } from '@owlieio/core';

const execFileAsync = promisify(execFile);

export type WhisperDevice = 'cpu' | 'cuda' | 'auto';
export interface WhisperLocalConfig {
  model?: string;
  language?: string;
  computeType?: string;
  device?: WhisperDevice;
  ffmpegPath?: string;
  ffprobePath?: string;
  pythonPath?: string;
}

/** Injectable, argument-array-only child-process seam. */
export type SubprocessRunner = (
  file: string,
  args: readonly string[],
  options: { signal?: AbortSignal },
) => Promise<void>;

export const DEFAULT_WHISPER_MODEL = 'small';
export const DEFAULT_WHISPER_LANGUAGE = 'auto';
export const DEFAULT_WHISPER_COMPUTE_TYPE = 'int8';
export const DEFAULT_WHISPER_DEVICE = 'auto';

const runProcess: SubprocessRunner = async (file, args, options) => {
  try {
    await execFileAsync(file, [...args], { signal: options.signal });
  } catch (cause) {
    if (options.signal?.aborted) throw new CancelledError('transcription cancelled', { cause });
    throw cause;
  }
};

function requiredMediaPath(input: TranscriptionInput): string {
  if (!input.mediaPath)
    throw new ConfigurationError('local transcription requires a downloaded mediaPath');
  return input.mediaPath;
}

function asSegments(value: unknown): TranscriptionResult['segments'] {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((segment) => {
    if (!segment || typeof segment !== 'object') return [];
    const entry = segment as Record<string, unknown>;
    if (
      typeof entry.start !== 'number' ||
      typeof entry.end !== 'number' ||
      typeof entry.text !== 'string'
    )
      return [];
    return [{ start: entry.start, end: entry.end, text: entry.text }];
  });
}

// This constant is passed as a Python argument, never interpolated into a shell.
const PYTHON_TRANSCRIBE =
  "import json,sys; from faster_whisper import WhisperModel; audio,out,model,language,device,compute=sys.argv[1:]; m=WhisperModel(model, device=device, compute_type=compute); segments,info=m.transcribe(audio, language=None if language == 'auto' else language); rows=[{'start':s.start,'end':s.end,'text':s.text} for s in segments]; json.dump({'text':' '.join(x['text'].strip() for x in rows).strip(),'language':info.language,'segments':rows}, open(out,'w'))";

/** Local faster-whisper transcriber; all configuration is explicit. */
export class WhisperLocalTranscriber implements Transcriber {
  static readonly id = 'whisper-local';
  readonly id = WhisperLocalTranscriber.id;
  readonly config: WhisperLocalConfig;
  private readonly run: SubprocessRunner;

  constructor(config: WhisperLocalConfig = {}, run: SubprocessRunner = runProcess) {
    this.config = config;
    this.run = run;
  }

  async transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const mediaPath = requiredMediaPath(input);
    const model = options.model ?? this.config.model ?? DEFAULT_WHISPER_MODEL;
    const language = options.language ?? this.config.language ?? DEFAULT_WHISPER_LANGUAGE;
    const computeType =
      options.computeType ?? this.config.computeType ?? DEFAULT_WHISPER_COMPUTE_TYPE;
    const device = this.config.device ?? DEFAULT_WHISPER_DEVICE;
    const ffmpeg = this.config.ffmpegPath ?? 'ffmpeg';
    const ffprobe = this.config.ffprobePath ?? 'ffprobe';
    const python = this.config.pythonPath ?? 'python3';
    const workDir = await mkdtemp(join(tmpdir(), 'owlie-whisper-'));
    const wavPath = join(workDir, 'audio.wav');
    const outputPath = join(workDir, 'transcript.json');
    options.progress?.emit({ type: 'started', target: mediaPath });
    try {
      await this.run(ffprobe, ['-v', 'error', '-show_format', '-of', 'json', mediaPath], {
        signal: options.signal,
      });
      await this.run(ffmpeg, ['-y', '-i', mediaPath, '-ar', '16000', '-ac', '1', wavPath], {
        signal: options.signal,
      });
      await this.run(
        python,
        ['-c', PYTHON_TRANSCRIBE, wavPath, outputPath, model, language, device, computeType],
        { signal: options.signal },
      );
      const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
      const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      if (!text) throw new TranscriptionError('faster-whisper produced an empty transcript');
      const result = {
        text,
        language: typeof parsed.language === 'string' ? parsed.language : undefined,
        segments: asSegments(parsed.segments),
        metadata: { provider: this.id, model },
      };
      options.progress?.emit({ type: 'completed', target: mediaPath, result });
      return result;
    } catch (cause) {
      if (cause instanceof CancelledError || options.signal?.aborted)
        throw new CancelledError('transcription cancelled', { cause });
      if (cause instanceof TranscriptionError || cause instanceof ConfigurationError) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new TranscriptionError(
        `local transcription failed; ensure ${ffprobe}, ${ffmpeg}, and ${python} with faster-whisper are installed (install ffmpeg/ffprobe from your package manager and run "python3 -m pip install faster-whisper"): ${message}`,
        { cause },
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

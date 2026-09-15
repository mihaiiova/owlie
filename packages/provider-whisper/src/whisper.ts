import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ProgressSink,
  Transcriber,
  TranscriptionInput,
  TranscriptionOptions,
  TranscriptionResult,
} from '@owlieio/core';
import type { TranscriptionSegment } from '@owlieio/core';
import { CancelledError, ConfigurationError, TranscriptionError } from '@owlieio/core';

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

/**
 * Injectable, argument-array-only child-process seam. Returns the process's
 * stdout so callers can read structured output (ffprobe duration) and, via the
 * optional `onStdout` callback, observe streaming progress lines.
 */
export type SubprocessRunner = (
  file: string,
  args: readonly string[],
  options: { signal?: AbortSignal; onStdout?: (chunk: string) => void },
) => Promise<string>;

export const DEFAULT_WHISPER_MODEL = 'small';
export const DEFAULT_WHISPER_LANGUAGE = 'auto';
export const DEFAULT_WHISPER_COMPUTE_TYPE = 'int8';
export const DEFAULT_WHISPER_DEVICE = 'auto';
export const DEFAULT_CHUNK_SECONDS = 300;
export const DEFAULT_CHUNK_OVERLAP_SECONDS = 2;

const runProcess: SubprocessRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { signal: options.signal });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (options.signal?.aborted) {
        reject(new CancelledError('transcription cancelled', { cause: error }));
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (options.signal?.aborted) {
        reject(new CancelledError('transcription cancelled'));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${file} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });

function requiredMediaPath(input: TranscriptionInput): string {
  if (!input.mediaPath)
    throw new ConfigurationError('local transcription requires a downloaded mediaPath');
  return input.mediaPath;
}

function asSegments(value: unknown): TranscriptionSegment[] | undefined {
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

/** A bounded audio window of the normalized media, in seconds. */
export interface ChunkRange {
  start: number;
  end: number;
}

/** The raw transcript for one chunk, before overlap trimming and time offsets. */
export interface ChunkTranscript {
  text: string;
  language?: string;
  segments?: TranscriptionSegment[];
}

/**
 * Splits a duration into overlapping chunks of `chunkSeconds` with
 * `overlapSeconds` of overlap between consecutive chunks (except the first).
 * Pure; the last chunk is clamped to the duration.
 */
export function computeChunkRanges(
  durationSeconds: number,
  chunkSeconds: number = DEFAULT_CHUNK_SECONDS,
  overlapSeconds: number = DEFAULT_CHUNK_OVERLAP_SECONDS,
): ChunkRange[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (chunkSeconds <= 0) return [];
  const step = Math.max(chunkSeconds - overlapSeconds, 1);
  const ranges: ChunkRange[] = [];
  let start = 0;
  for (;;) {
    const end = Math.min(start + chunkSeconds, durationSeconds);
    ranges.push({ start, end });
    if (end >= durationSeconds) break;
    start += step;
  }
  return ranges;
}

/**
 * Merges chunk transcripts in chronological order: offsets segment times by
 * each chunk's start and drops the overlap tail (content that the next chunk
 * re-covers) so segments never double-count the overlap window.
 */
export function mergeChunkTranscripts(
  chunks: readonly ChunkTranscript[],
  ranges: readonly ChunkRange[],
): { text: string; language?: string; segments: TranscriptionSegment[] } {
  const merged: TranscriptionSegment[] = [];
  let language: string | undefined;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    if (chunk.language && language === undefined) language = chunk.language;
    const offset = ranges[i]?.start ?? 0;
    const nextStart = ranges[i + 1]?.start;
    for (const segment of chunk.segments ?? []) {
      const start = segment.start + offset;
      let end = segment.end + offset;
      if (nextStart !== undefined) {
        if (start >= nextStart) continue;
        end = Math.min(end, nextStart);
      }
      if (end > start) merged.push({ start, end, text: segment.text });
    }
  }
  let text = merged
    .map((segment) => segment.text)
    .join(' ')
    .trim();
  if (!text) {
    text = chunks
      .map((chunk) => chunk?.text ?? '')
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return { text, language, segments: merged };
}

function parseDuration(probe: string): number | undefined {
  try {
    const value = JSON.parse(probe) as { format?: { duration?: string | number } };
    const duration = value.format?.duration;
    const seconds = typeof duration === 'string' ? Number.parseFloat(duration) : duration;
    return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? seconds
      : undefined;
  } catch {
    return undefined;
  }
}

function parseChunkResults(raw: unknown): ChunkTranscript[] {
  if (!Array.isArray(raw)) {
    throw new TranscriptionError('faster-whisper produced invalid chunk output');
  }
  return raw.map((entry): ChunkTranscript => {
    if (!entry || typeof entry !== 'object') return { text: '' };
    const record = entry as Record<string, unknown>;
    return {
      text: typeof record.text === 'string' ? record.text : '',
      language: typeof record.language === 'string' ? record.language : undefined,
      segments: asSegments(record.segments),
    };
  });
}

// This constant is passed as a Python argument, never interpolated into a shell.
// It loads the Whisper model once and transcribes every supplied chunk file,
// writing an ordered array of per-chunk results and streaming `PROGRESS i/total`
// lines to stdout.
const PYTHON_TRANSCRIBE =
  "import json,sys; from faster_whisper import WhisperModel; out,model,language,device,compute=sys.argv[1:6]; audio_paths=sys.argv[6:]; m=WhisperModel(model, device=device, compute_type=compute); results=[]; total=len(audio_paths);\nfor i,audio in enumerate(audio_paths):\n    segments,info=m.transcribe(audio, language=None if language == 'auto' else language); rows=[{'start':s.start,'end':s.end,'text':s.text} for s in segments]; text=' '.join(x['text'].strip() for x in rows).strip(); results.append({'text':text,'language':info.language,'segments':rows}); print('PROGRESS %d/%d' % (i+1,total), flush=True)\njson.dump(results, open(out,'w'))";

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
    if (options.signal?.aborted) throw new CancelledError('transcription cancelled');
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
      const probe = await this.run(
        ffprobe,
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', mediaPath],
        { signal: options.signal },
      );
      const duration = parseDuration(probe);

      await this.run(ffmpeg, ['-y', '-i', mediaPath, '-ar', '16000', '-ac', '1', wavPath], {
        signal: options.signal,
      });

      const ranges = duration !== undefined ? computeChunkRanges(duration) : [];
      let chunkPaths: string[];
      if (ranges.length > 1) {
        chunkPaths = [];
        for (let i = 0; i < ranges.length; i++) {
          const range = ranges[i]!;
          const chunkPath = join(workDir, `chunk-${i}.wav`);
          await this.run(
            ffmpeg,
            [
              '-y',
              '-ss',
              String(range.start),
              '-i',
              wavPath,
              '-t',
              String(range.end - range.start),
              '-ar',
              '16000',
              '-ac',
              '1',
              chunkPath,
            ],
            { signal: options.signal },
          );
          chunkPaths.push(chunkPath);
        }
      } else {
        chunkPaths = [wavPath];
      }

      let buffer = '';
      const onStdout = (chunk: string): void => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) this.emitProgressLine(line, mediaPath, options.progress);
        }
      };

      await this.run(
        python,
        ['-c', PYTHON_TRANSCRIBE, outputPath, model, language, device, computeType, ...chunkPaths],
        { signal: options.signal, onStdout },
      );
      if (buffer.trim()) this.emitProgressLine(buffer, mediaPath, options.progress);

      const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as unknown;
      const merged = mergeChunkTranscripts(parseChunkResults(parsed), ranges);
      if (!merged.text) throw new TranscriptionError('faster-whisper produced an empty transcript');
      const result: TranscriptionResult = {
        text: merged.text,
        language: merged.language,
        segments: merged.segments.length > 0 ? merged.segments : undefined,
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

  private emitProgressLine(line: string, target: string, progress: ProgressSink | undefined): void {
    const match = line.trim().match(/^PROGRESS (\d+)\/(\d+)$/);
    if (!match) return;
    progress?.emit({
      type: 'progress',
      target,
      current: Number(match[1]),
      total: Number(match[2]),
      message: `transcribing chunk ${match[1]}/${match[2]}`,
    });
  }
}

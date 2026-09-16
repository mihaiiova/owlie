'use strict';

/* global module */

// Deterministic in-memory behavior for the local transcription runtime
// (ffprobe, ffmpeg, python3/faster-whisper). The generated command shims are
// thin adapters that forward `process.argv` into these pure functions, so the
// default suite can test the runtime behavior without spawning subprocesses or
// touching the network.

const TRANSCRIPT_TEXT = 'hello from the extractor runtime';
const FFPROBE_DURATION_SECONDS = 3;

/** Simulates a healthy `ffprobe` probe: a positive, parseable duration. */
function ffprobe() {
  return {
    stdout: `${JSON.stringify({ format: { duration: String(FFPROBE_DURATION_SECONDS) } })}\n`,
    stderr: '',
    exitCode: 0,
  };
}

/** Simulates a healthy `ffmpeg` transcode: no output, success. */
function ffmpeg() {
  return { stdout: '', stderr: '', exitCode: 0 };
}

/**
 * Simulates `python3` for the two doctor probes and the transcription
 * invocation. The transcription call is `python3 -c SCRIPT out model language
 * device compute [chunk...]`; `out` is argv[2] and chunk paths begin at
 * argv[7].
 *
 * @param {string[]} args the spawn argument array (`process.argv.slice(2)`)
 * @param {'healthy' | 'missing-model'} [mode]
 */
function python3(args, mode = 'healthy') {
  const first = args[0];
  const second = args[1];
  if (first === '--version') return { stdout: '', stderr: '', exitCode: 0 };
  if (first === '-c' && second === 'import faster_whisper') {
    return { stdout: '', stderr: '', exitCode: 0 };
  }
  if (first === '-c') {
    if (mode === 'missing-model') {
      return {
        stdout: '',
        stderr: 'OWLIE_MODEL_UNAVAILABLE: no local model files found\n',
        exitCode: 1,
      };
    }
    const out = args[2];
    const chunks = args.slice(7);
    const count = chunks.length > 0 ? chunks.length : 1;
    const results = Array.from({ length: count }, (_, i) => ({
      text: TRANSCRIPT_TEXT,
      language: 'en',
      segments: [{ start: i, end: i + 1, text: TRANSCRIPT_TEXT }],
    }));
    return {
      stdout: `PROGRESS 1/${count}\n`,
      stderr: '',
      exitCode: 0,
      file: { path: out, content: JSON.stringify(results) },
    };
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

module.exports = { ffmpeg, ffprobe, python3, FFPROBE_DURATION_SECONDS, TRANSCRIPT_TEXT };

import { describe, expect, it } from 'vitest';

import runtime from './runtime-behavior.cjs';

const { ffmpeg, ffprobe, python3, TRANSCRIPT_TEXT } = runtime;

describe('ffprobe shim behavior', () => {
  it('reports a positive duration as JSON', () => {
    const result = ffprobe();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(Number(parsed.format.duration)).toBeGreaterThan(0);
  });
});

describe('ffmpeg shim behavior', () => {
  it('succeeds without output', () => {
    expect(ffmpeg()).toEqual({ stdout: '', stderr: '', exitCode: 0 });
  });
});

describe('python3 shim behavior', () => {
  it('answers the doctor version probe', () => {
    expect(python3(['--version'])).toEqual({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('answers the doctor faster-whisper import probe', () => {
    expect(python3(['-c', 'import faster_whisper'])).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
  });

  it('writes a deterministic transcript for the transcription invocation', () => {
    const result = python3(
      ['-c', 'SCRIPT', '/tmp/out.json', 'small', 'auto', 'auto', 'int8', '/tmp/chunk.wav'],
      'healthy',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^PROGRESS 1\/1\n$/);
    expect(result.stderr).toBe('');
    expect(result.file.path).toBe('/tmp/out.json');
    const parsed = JSON.parse(result.file.content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe(TRANSCRIPT_TEXT);
    expect(parsed[0].language).toBe('en');
    expect(parsed[0].segments).toEqual([{ start: 0, end: 1, text: TRANSCRIPT_TEXT }]);
  });

  it('emits one result per chunk', () => {
    const result = python3(
      ['-c', 'SCRIPT', '/tmp/out.json', 'small', 'auto', 'auto', 'int8', '/a.wav', '/b.wav'],
      'healthy',
    );
    expect(result.stdout).toBe('PROGRESS 1/2\n');
    expect(JSON.parse(result.file.content)).toHaveLength(2);
  });

  it('fails with the model-unavailable marker when configured', () => {
    const result = python3(
      ['-c', 'SCRIPT', '/tmp/out.json', 'small', 'auto', 'auto', 'int8', '/a.wav'],
      'missing-model',
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/OWLIE_MODEL_UNAVAILABLE/);
    expect(result.stdout).toBe('');
    expect(result.file).toBeUndefined();
  });

  it('still answers the doctor probes in missing-model mode', () => {
    expect(python3(['--version'], 'missing-model')).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    expect(python3(['-c', 'import faster_whisper'], 'missing-model')).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
  });
});

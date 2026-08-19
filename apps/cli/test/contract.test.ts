import { describe, expect, it } from 'vitest';
import {
  CaptionsUnavailableError,
  ExtractionError,
  NotImplementedError,
  OwlieError,
  ValidationError,
} from '@owlieio/core';
import { ExitCode, exitCodeForError, parseArgs, resolveProcessInput } from 'owlie';

describe('parseArgs', () => {
  it('parses the process input flags', () => {
    const parsed = parseArgs([
      '--input',
      'transcript.txt',
      '--input-format',
      'json',
      '--prompt',
      'Summarize this',
    ]);
    expect(parsed.options.input).toBe('transcript.txt');
    expect(parsed.options.inputFormat).toBe('json');
    expect(parsed.options.prompt).toBe('Summarize this');
  });

  it('supports --flag=value forms', () => {
    const parsed = parseArgs(['--input=transcript.txt', '--input-format=text', '--prompt=Hi']);
    expect(parsed.options.input).toBe('transcript.txt');
    expect(parsed.options.inputFormat).toBe('text');
    expect(parsed.options.prompt).toBe('Hi');
  });

  it('rejects an unknown --input-format', () => {
    expect(parseArgs(['--input-format', 'xml']).usageError).toContain('--input-format');
  });

  it('rejects a missing --input value', () => {
    expect(parseArgs(['--input']).usageError).toContain('--input');
  });

  it('rejects a missing --prompt value', () => {
    expect(parseArgs(['--prompt']).usageError).toContain('--prompt');
  });

  it('parses --model', () => {
    expect(parseArgs(['--model', 'deepseek-chat']).options.model).toBe('deepseek-chat');
    expect(parseArgs(['--model=deepseek-reasoner']).options.model).toBe('deepseek-reasoner');
  });

  it('parses --language', () => {
    expect(parseArgs(['--language', 'de,en']).options.language).toBe('de,en');
    expect(parseArgs(['--language=fr']).options.language).toBe('fr');
  });
});

describe('exitCodeForError', () => {
  it('maps typed errors to exit codes', () => {
    expect(exitCodeForError(new ValidationError('x'))).toBe(ExitCode.Usage);
    expect(exitCodeForError(new NotImplementedError('x'))).toBe(ExitCode.NotImplemented);
    expect(exitCodeForError(new ExtractionError('x'))).toBe(ExitCode.Error);
    expect(exitCodeForError(new CaptionsUnavailableError('x'))).toBe(ExitCode.Error);
    expect(exitCodeForError(new OwlieError('x'))).toBe(ExitCode.Error);
    expect(exitCodeForError(new Error('x'))).toBe(ExitCode.Error);
    expect(exitCodeForError('not an error')).toBe(ExitCode.Error);
  });
});

describe('resolveProcessInput', () => {
  it('chooses a positional file', () => {
    expect(resolveProcessInput({ positional: 'a.txt' })).toEqual({ kind: 'file', path: 'a.txt' });
  });

  it('chooses --input', () => {
    expect(resolveProcessInput({ input: 'b.txt' })).toEqual({ kind: 'input', path: 'b.txt' });
  });

  it('chooses piped stdin with content', () => {
    expect(resolveProcessInput({ stdin: { isTTY: false, content: 'hello' } })).toEqual({
      kind: 'stdin',
      content: 'hello',
    });
  });

  it('rejects a TTY stdin as no input', () => {
    expect(() => resolveProcessInput({ stdin: { isTTY: true, content: '' } })).toThrow(
      ValidationError,
    );
  });

  it('rejects ambiguous inputs', () => {
    expect(() => resolveProcessInput({ positional: 'a', input: 'b' })).toThrow(ValidationError);
    expect(() =>
      resolveProcessInput({ positional: 'a', stdin: { isTTY: false, content: 'x' } }),
    ).toThrow(ValidationError);
  });

  it('rejects no input', () => {
    expect(() => resolveProcessInput({})).toThrow(ValidationError);
  });

  it('rejects empty stdin as a general error (exit code 1)', () => {
    let threw = false;
    try {
      resolveProcessInput({ stdin: { isTTY: false, content: '   ' } });
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(OwlieError);
      expect(error).not.toBeInstanceOf(ValidationError);
      expect(exitCodeForError(error)).toBe(ExitCode.Error);
    }
    expect(threw).toBe(true);
  });
});

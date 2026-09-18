import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  ConfigurationError,
  ExtractionError,
  JSON_PROTOCOL_SCHEMA_VERSION,
} from '@owlieio/core';
import type { CliIo } from 'owlie';
import {
  redactUrl,
  redactUrls,
  writeCancelledRecord,
  writeErrorRecord,
  writeProgressRecord,
  writeResultEnvelope,
  writeStreamRecord,
  writeTerminalRecord,
} from 'owlie';

function capture(): {
  io: CliIo;
  stdout: () => string;
  stderr: () => string;
  stderrLines: () => unknown[];
} {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: false, read: async () => '' },
  };
  return {
    io,
    stdout: () => stdout,
    stderr: () => stderr,
    stderrLines: () =>
      stderr
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}

describe('protocol redaction', () => {
  it('strips userinfo, query, and fragment from a URL', () => {
    expect(redactUrl('https://alice:secret@example.com/path?token=query#frag')).toBe(
      'https://example.com/path',
    );
  });

  it('redacts every URL embedded in a diagnostic string', () => {
    expect(
      redactUrls('failed https://u:p@example.com/a?x=1#f and https://other.example/b?y=2'),
    ).toBe('failed https://example.com/a and https://other.example/b');
  });
});

describe('protocol records', () => {
  it('writes a single-result stdout envelope', () => {
    const { io, stdout } = capture();
    writeResultEnvelope(io, 'doctor', { ok: true });
    expect(JSON.parse(stdout())).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'doctor',
      result: { ok: true },
    });
  });

  it('writes a versioned stdout stream record with command identity', () => {
    const { io, stdout } = capture();
    writeStreamRecord(io, 'process', { item: { url: 'https://example.com/a' }, result: 'x' });
    expect(JSON.parse(stdout())).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'process',
      item: { url: 'https://example.com/a' },
      result: 'x',
    });
  });

  it('writes ordered versioned progress records with redacted targets and no result data', () => {
    const { io, stderrLines } = capture();
    writeProgressRecord(io, 'extract', {
      type: 'started',
      target: 'https://alice:secret@example.com/a?token=query#frag',
    });
    writeProgressRecord(io, 'extract', {
      type: 'completed',
      target: 'https://example.com/a?token=query',
      result: { canonicalUrl: 'https://example.com/a?token=query', apiKey: 'sk-secret' },
    });
    const records = stderrLines();
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'extract',
      kind: 'progress',
      event: { type: 'started', target: 'https://example.com/a' },
    });
    expect(records[1]).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'extract',
      kind: 'progress',
      event: { type: 'completed', target: 'https://example.com/a' },
    });
  });

  it('writes a terminal error record with a stable code', () => {
    const { io, stderrLines } = capture();
    writeTerminalRecord(io, 'list', new ExtractionError('boom', { code: 'EXTRACTION_ERROR' }));
    expect(stderrLines()[0]).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'list',
      kind: 'error',
      code: 'EXTRACTION_ERROR',
      message: 'boom',
    });
  });

  it('writes terminal cancellation and configuration records with stable codes', () => {
    const { io, stderrLines } = capture();
    writeTerminalRecord(io, 'process', new CancelledError('aborted'));
    writeTerminalRecord(io, 'process', new ConfigurationError('missing API key'));
    expect(stderrLines()[0]).toEqual({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command: 'process',
      kind: 'cancelled',
      message: 'aborted',
    });
    expect(stderrLines()[1]).toMatchObject({ kind: 'error', code: 'CONFIGURATION_ERROR' });
  });

  it('redacts URLs from terminal error and cancellation messages', () => {
    const { io, stderrLines } = capture();
    writeErrorRecord(
      io,
      'extract',
      'EXTRACTION_ERROR',
      'bad https://u:p@example.com/a?x=1#f with Bearer token-value and sk-secret',
    );
    writeCancelledRecord(io, 'extract', 'cancelled at https://u:p@example.com/b?x=2#g');
    const lines = stderrLines() as Array<{ message: string }>;
    expect(lines[0]?.message).toBe(
      'bad https://example.com/a with Bearer [REDACTED] and [REDACTED]',
    );
    expect(lines[1]?.message).toBe('cancelled at https://example.com/b');
  });
});

import {
  CancelledError,
  JSON_PROTOCOL_SCHEMA_VERSION,
  OwlieError,
  type ProgressEvent,
  type ProtocolErrorRecord,
  type ProtocolProgressRecord,
  type ProtocolResultEnvelope,
  type ProgressSink,
} from '@owlieio/core';
import type { CliOptions } from './cli.js';
import type { CliIo } from './io.js';
import type { SpinnerLike } from './spinner.js';
import { Spinner } from './spinner.js';
import { writeDiagnostic } from './style.js';

/** Stable code for CLI usage errors that are not represented by a thrown error. */
export const USAGE_ERROR_CODE = 'USAGE_ERROR';

/**
 * Strips URL userinfo, query, and fragment from a URL-shaped string so a
 * signed/tracked URL never leaks into a diagnostic. Non-URL strings are
 * returned unchanged (best-effort).
 */
export function redactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value;
  }
}

/** Redacts userinfo, query, and fragment from every URL found in a string. */
export function redactUrls(text: string): string {
  return String(text).replace(/https?:\/\/[^\s"'<>]+/g, (match) => redactUrl(match));
}

/** Redacts the URL-bearing string fields of a progress event before transport. */
function redactProgressEvent(event: ProgressEvent): ProgressEvent {
  const target = redactUrl(event.target);
  switch (event.type) {
    case 'started':
      return { type: 'started', target };
    case 'progress':
      return {
        ...event,
        target,
        message: event.message === undefined ? undefined : redactUrls(event.message),
      };
    case 'item':
      return { ...event, target };
    case 'completed':
      return { ...event, target };
    case 'failed':
      return { ...event, target, error: redactUrls(event.error) };
    case 'cancelled':
      return { type: 'cancelled', target };
  }
}

/** Writes the single-result stdout envelope for a successful `--json` command. */
export function writeResultEnvelope(io: CliIo, command: string, result: unknown): void {
  const envelope: ProtocolResultEnvelope = {
    schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
    command,
    result,
  };
  io.stdout.write(JSON.stringify(envelope) + '\n');
}

/**
 * Writes one command-defined stdout JSONL record for a streaming command,
 * adding the protocol version and command identity to the command's payload.
 */
export function writeStreamRecord(
  io: CliIo,
  command: string,
  payload: Record<string, unknown>,
): void {
  io.stdout.write(
    JSON.stringify({ schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION, command, ...payload }) + '\n',
  );
}

/** Writes one versioned JSONL progress record to stderr. */
export function writeProgressRecord(io: CliIo, command: string, event: ProgressEvent): void {
  const record: ProtocolProgressRecord = {
    schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
    command,
    kind: 'progress',
    event: redactProgressEvent(event),
  };
  io.stderr.write(JSON.stringify(record) + '\n');
}

/** Writes one versioned JSONL error record to stderr. */
export function writeErrorRecord(io: CliIo, command: string, code: string, message: string): void {
  const record: ProtocolErrorRecord = {
    schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
    command,
    kind: 'error',
    code,
    message: redactUrls(message),
  };
  io.stderr.write(JSON.stringify(record) + '\n');
}

/** Writes one versioned JSONL cancellation record to stderr. */
export function writeCancelledRecord(io: CliIo, command: string, message: string): void {
  io.stderr.write(
    JSON.stringify({
      schemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
      command,
      kind: 'cancelled',
      message: redactUrls(message),
    }) + '\n',
  );
}

/** Writes a terminal record for a thrown error (error or cancellation). */
export function writeTerminalRecord(
  io: CliIo,
  command: string,
  error: unknown,
  messageOverride?: string,
): void {
  const message = messageOverride ?? (error instanceof Error ? error.message : String(error));
  if (error instanceof CancelledError) {
    writeCancelledRecord(io, command, message);
    return;
  }
  const code = error instanceof OwlieError ? error.code : 'OWLIE_ERROR';
  writeErrorRecord(io, command, code, message);
}

/**
 * Writes a command failure: a versioned terminal record in `--json` mode,
 * human diagnostics otherwise. `--quiet` suppresses both forms.
 */
export function writeCommandError(
  io: CliIo,
  options: Pick<CliOptions, 'json' | 'quiet'>,
  command: string,
  error: unknown,
): void {
  if (options.quiet) return;
  if (options.json) {
    writeTerminalRecord(io, command, error);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  writeDiagnostic(io, 'error', message);
}

/**
 * Writes an inline usage failure (not represented by a thrown error): a
 * versioned error record in `--json` mode, a human warning otherwise.
 */
export function writeUsageError(
  io: CliIo,
  options: Pick<CliOptions, 'json' | 'quiet'>,
  command: string,
  message: string,
): void {
  if (options.quiet) return;
  if (options.json) {
    writeErrorRecord(io, command, USAGE_ERROR_CODE, message);
    return;
  }
  writeDiagnostic(io, 'warning', message);
}

/**
 * Builds the command's {@link ProgressSink}. In `--json` mode every event
 * becomes an ordered versioned JSONL record on stderr; otherwise the supplied
 * human emitter drives the spinner exactly as before.
 */
export function createProgressSink(
  io: CliIo,
  options: Pick<CliOptions, 'json' | 'quiet'>,
  command: string,
  human: (event: ProgressEvent) => void,
): ProgressSink {
  if (options.json) {
    return {
      emit: (event) => {
        if (!options.quiet) writeProgressRecord(io, command, event);
      },
    };
  }
  return { emit: human };
}

const NOOP_SPINNER: SpinnerLike = {
  start: () => {},
  update: () => {},
  stop: () => {},
};

/**
 * Creates the command's spinner. In `--json` mode the spinner is a no-op so
 * spinner frames never corrupt the stderr JSONL stream; otherwise the injected
 * spinner (tests) or a real stderr spinner is used.
 */
export function createCommandSpinner(
  io: CliIo,
  options: Pick<CliOptions, 'json' | 'quiet'>,
  injected?: SpinnerLike,
): SpinnerLike {
  if (options.json) return NOOP_SPINNER;
  return (
    injected ??
    new Spinner({
      write: (text) => {
        if (!options.quiet) io.stderr.write(text);
      },
      tty: io.stderr.isTTY,
    })
  );
}

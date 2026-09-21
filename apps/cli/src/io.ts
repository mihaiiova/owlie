import { CancelledError, NotImplementedError, OwlieError, ValidationError } from '@owlieio/core';

export interface Stdin {
  isTTY: boolean;
  read(): Promise<string>;
}

export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void; isTTY: boolean };
  stdin: Stdin;
}

export const ExitCode = {
  Success: 0,
  Error: 1,
  Usage: 2,
  NotImplemented: 3,
  /** Cancellation (SIGINT/SIGTERM or a deadline) is a distinct, non-retryable outcome. */
  Cancelled: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Translates a thrown error into a process exit code: `CancelledError` →
 * cancelled (130), `ValidationError` → usage (2), `NotImplementedError` →
 * not-implemented (3), every other typed or unknown error → general failure (1).
 */
export function exitCodeForError(error: unknown): ExitCode {
  if (error instanceof CancelledError) return ExitCode.Cancelled;
  if (error instanceof ValidationError) return ExitCode.Usage;
  if (error instanceof NotImplementedError) return ExitCode.NotImplemented;
  if (error instanceof OwlieError) return ExitCode.Error;
  return ExitCode.Error;
}

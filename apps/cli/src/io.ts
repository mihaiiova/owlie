import { NotImplementedError, OwlieError, ValidationError } from '@owlieio/core';

export interface Stdin {
  isTTY: boolean;
  read(): Promise<string>;
}

export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  stdin: Stdin;
}

export const ExitCode = {
  Success: 0,
  Error: 1,
  Usage: 2,
  NotImplemented: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Translates a thrown error into a process exit code: `ValidationError` →
 * usage (2), `NotImplementedError` → not-implemented (3), every other typed or
 * unknown error → general failure (1).
 */
export function exitCodeForError(error: unknown): ExitCode {
  if (error instanceof ValidationError) return ExitCode.Usage;
  if (error instanceof NotImplementedError) return ExitCode.NotImplemented;
  if (error instanceof OwlieError) return ExitCode.Error;
  return ExitCode.Error;
}

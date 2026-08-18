export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

export const ExitCode = {
  Success: 0,
  Error: 1,
  Usage: 2,
  NotImplemented: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

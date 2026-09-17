import type { CliIo } from './io.js';

/** Diagnostic severity levels rendered with distinct colors on a TTY. */
export type Severity = 'error' | 'warning' | 'info';

const STYLES: Record<Severity, { open: string; close: string }> = {
  error: { open: '\u001b[31m', close: '\u001b[0m' },
  warning: { open: '\u001b[33m', close: '\u001b[0m' },
  info: { open: '\u001b[2m', close: '\u001b[0m' },
};

/**
 * Colors a diagnostic message by severity. Returns the message unchanged when
 * `enabled` is false, so piped/redirected output stays free of ANSI escapes.
 */
export function colorize(severity: Severity, text: string, enabled: boolean): string {
  if (!enabled) return text;
  const { open, close } = STYLES[severity];
  return `${open}${text}${close}`;
}

/** Writes a severity-colored diagnostic line (no prefix) to stderr. */
export function writeDiagnostic(io: CliIo, severity: Severity, message: string): void {
  io.stderr.write(`${colorize(severity, message, io.stderr.isTTY)}\n`);
}

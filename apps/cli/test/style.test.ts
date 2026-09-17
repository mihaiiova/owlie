import { describe, expect, it } from 'vitest';
import { colorize, writeDiagnostic } from 'owlie';
import type { CliIo } from 'owlie';

describe('colorize', () => {
  it('wraps the message in the severity color code', () => {
    expect(colorize('error', 'boom', true)).toBe('\u001b[31mboom\u001b[0m');
    expect(colorize('warning', 'careful', true)).toBe('\u001b[33mcareful\u001b[0m');
    expect(colorize('info', 'note', true)).toBe('\u001b[2mnote\u001b[0m');
  });

  it('returns the message unchanged when coloring is disabled', () => {
    expect(colorize('error', 'boom', false)).toBe('boom');
  });
});

describe('writeDiagnostic', () => {
  it('writes a newline-terminated message and colors only on a TTY', () => {
    const writes: string[] = [];
    const tty: CliIo = {
      stdout: { write: () => {} },
      stderr: { write: (chunk) => writes.push(chunk), isTTY: true },
      stdin: { isTTY: false, read: async () => '' },
    };
    writeDiagnostic(tty, 'error', 'boom');
    expect(writes).toEqual(['\u001b[31mboom\u001b[0m\n']);
  });

  it('writes a plain message when stderr is not a TTY', () => {
    const writes: string[] = [];
    const piped: CliIo = {
      stdout: { write: () => {} },
      stderr: { write: (chunk) => writes.push(chunk), isTTY: false },
      stdin: { isTTY: false, read: async () => '' },
    };
    writeDiagnostic(piped, 'error', 'boom');
    expect(writes).toEqual(['boom\n']);
  });
});

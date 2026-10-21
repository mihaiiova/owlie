import { describe, expect, it, vi } from 'vitest';
import { Spinner, spinnerLine } from 'owlie';

function collector() {
  const writes: string[] = [];
  return { writes, write: (text: string) => writes.push(text) };
}

describe('spinnerLine', () => {
  it('prefixes the frame with a carriage return and clears the rest of the line', () => {
    expect(spinnerLine('⠋', 'processing')).toBe('\r⠋ processing\x1b[K');
  });
});

describe('Spinner', () => {
  it('renders the first frame on start', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a', 'b'], intervalMs: 1000 });
    spinner.start('processing');
    expect(writes).toEqual(['\ra processing\x1b[K']);
    spinner.stop();
  });

  it('advances frames', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a', 'b', 'c'], intervalMs: 1000 });
    spinner.start('processing');
    spinner.advance();
    spinner.advance();
    spinner.advance();
    expect(writes).toEqual([
      '\ra processing\x1b[K',
      '\rb processing\x1b[K',
      '\rc processing\x1b[K',
      '\ra processing\x1b[K',
    ]);
    spinner.stop();
  });

  it('clears the line on stop', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a'], intervalMs: 1000 });
    spinner.start('processing');
    spinner.stop();
    expect(writes[writes.length - 1]).toBe('\r\x1b[K');
  });

  it('does not write on stop when never started', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a'], intervalMs: 1000 });
    spinner.stop();
    expect(writes).toEqual([]);
  });

  it('updates the message', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a'], intervalMs: 1000 });
    spinner.start('first');
    spinner.update('second');
    expect(writes).toEqual(['\ra first\x1b[K', '\ra second\x1b[K']);
    spinner.stop();
  });

  it('leaves no characters from a longer previous message on screen', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a'], intervalMs: 1000 });
    spinner.start('fetching transcript YiFqcu9YA38');
    spinner.update('waiting for llm response');
    expect(visibleLine(writes)).toBe('a waiting for llm response');
    spinner.stop();
  });

  it('ticks on an interval', () => {
    vi.useFakeTimers();
    try {
      const { writes, write } = collector();
      const spinner = new Spinner({ write, frames: ['a', 'b'], intervalMs: 100 });
      spinner.start('processing');
      vi.advanceTimersByTime(250);
      spinner.stop();
      // start + two advances
      expect(writes.length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes plain status lines instead of animating when tty is false', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, tty: false });
    spinner.start('waiting for llm response');
    spinner.update('done');
    spinner.stop();
    expect(writes).toEqual(['waiting for llm response\n', 'done\n']);
    expect(spinner.active).toBe(false);
  });

  it('deduplicates repeated status lines when tty is false', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, tty: false });
    spinner.start('waiting');
    spinner.update('waiting');
    spinner.update('done');
    expect(writes).toEqual(['waiting\n', 'done\n']);
  });
});

/** Replays writes on one terminal line: `\r` returns, `\x1b[K` clears to the end. */
function visibleLine(writes: string[]): string {
  const clear = '\x1b[K';
  const text = writes.join('');
  let line = '';
  let cursor = 0;
  for (let i = 0; i < text.length;) {
    if (text.startsWith(clear, i)) {
      line = line.slice(0, cursor);
      i += clear.length;
    } else if (text[i] === '\r') {
      cursor = 0;
      i += 1;
    } else {
      line = line.slice(0, cursor) + text[i] + line.slice(cursor + 1);
      cursor += 1;
      i += 1;
    }
  }
  return line;
}

import { describe, expect, it, vi } from 'vitest';
import { Spinner, spinnerLine } from 'owlie';

function collector() {
  const writes: string[] = [];
  return { writes, write: (text: string) => writes.push(text) };
}

describe('spinnerLine', () => {
  it('prefixes the frame with a carriage return', () => {
    expect(spinnerLine('⠋', 'processing')).toBe('\r⠋ processing');
  });
});

describe('Spinner', () => {
  it('renders the first frame on start', () => {
    const { writes, write } = collector();
    const spinner = new Spinner({ write, frames: ['a', 'b'], intervalMs: 1000 });
    spinner.start('processing');
    expect(writes).toEqual(['\ra processing']);
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
      '\ra processing',
      '\rb processing',
      '\rc processing',
      '\ra processing',
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
    expect(writes).toEqual(['\ra first', '\ra second']);
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
});

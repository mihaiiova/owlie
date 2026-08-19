/** Minimal spinner for long-running commands. Writes to stderr only. */
export const DEFAULT_SPINNER_FRAMES: readonly string[] = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
];

export const DEFAULT_SPINNER_INTERVAL_MS = 80;

/** The minimal surface a spinner exposes to commands (injected for tests). */
export interface SpinnerLike {
  start(message: string): void;
  update?(message: string): void;
  stop(): void;
}

export function spinnerLine(frame: string, message: string): string {
  return `\r${frame} ${message}`;
}

export interface SpinnerOptions {
  write(text: string): void;
  frames?: readonly string[];
  intervalMs?: number;
}

/** A carriage-return spinner that overwrites a single stderr line. */
export class Spinner implements SpinnerLike {
  private index = 0;
  private message = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly frames: readonly string[];
  private readonly intervalMs: number;

  constructor(private readonly options: SpinnerOptions) {
    this.frames = options.frames ?? DEFAULT_SPINNER_FRAMES;
    this.intervalMs = options.intervalMs ?? DEFAULT_SPINNER_INTERVAL_MS;
  }

  get active(): boolean {
    return this.timer !== undefined;
  }

  start(message: string): void {
    this.message = message;
    this.render();
    if (this.timer === undefined) {
      this.timer = setInterval(() => this.advance(), this.intervalMs);
    }
  }

  update(message: string): void {
    this.message = message;
    this.render();
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.options.write('\r\x1b[K');
    }
  }

  /** Advances one frame and re-renders (exposed for tests). */
  advance(): void {
    this.index = (this.index + 1) % this.frames.length;
    this.render();
  }

  private render(): void {
    const frame = this.frames[this.index] ?? '';
    this.options.write(spinnerLine(frame, this.message));
  }
}

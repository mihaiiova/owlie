import { CancelledError } from '@owlieio/core';

/** Waits `ms` milliseconds, or rejects with {@link CancelledError} when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError('arXiv request cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancelledError('arXiv request cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Serializes requests and spaces their starts at least `intervalMs` apart, as
 * the arXiv API terms ask (one request every three seconds).
 */
export class RequestGate {
  private last = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void> = sleep,
  ) {}

  /**
   * Runs `task` once the previous task has finished and the interval since
   * the last start has passed, so requests never overlap.
   */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const result = this.queue.then(async () => {
      const delay = this.last + this.intervalMs - this.now();
      if (delay > 0) await this.wait(delay, signal);
      this.last = this.now();
      return task();
    });
    // A cancelled or failed task must not block the requests behind it.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/** API spacing required by the arXiv API terms of use. */
export const ARXIV_API_INTERVAL_MS = 3_000;

/** One gate per process, shared by every adapter instance. */
export const sharedArxivApiGate = new RequestGate(ARXIV_API_INTERVAL_MS);

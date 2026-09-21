import type { HttpFetchPolicy } from '@owlieio/core';
import {
  CancelledError,
  ConfigurationError,
  createHttpByteBudget,
  OwlieError,
} from '@owlieio/core';
import type { CliIo } from './io.js';

/**
 * Raised when a command would write more stdout bytes than its configured
 * budget. This is a distinct runtime limit, not a cancellation: the process
 * exits 1 and emits a versioned `error` terminal record.
 */
export class OutputLimitExceededError extends OwlieError {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`stdout exceeded the ${limitBytes}-byte budget`, {
      code: 'OUTPUT_LIMIT_EXCEEDED',
    });
    this.limitBytes = limitBytes;
  }
}

/**
 * Parses a positive-integer flag value, returning `undefined` when absent and
 * throwing {@link ConfigurationError} for non-positive, non-safe-integer, or
 * non-decimal values. Shared by every invocation-wide byte/time budget flag.
 */
export function parsePositiveIntegerFlag(
  value: string | undefined,
  flag: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new ConfigurationError(`${flag} must be a positive integer`);
  }
  return Number(value);
}

/**
 * Starts an invocation-wide deadline that aborts its signal after `timeoutMs`.
 * The signal is aborted with a {@link CancelledError} reason so cooperative
 * consumers (including `AbortSignal.throwIfAborted()` callers) surface
 * cancellation rather than a bare `AbortError`.
 */
export function createDeadline(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new CancelledError('timed out')), timeoutMs);
  (timer as { unref?: () => void }).unref?.();
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

/**
 * Combines zero or more parent signals into one child signal that aborts when
 * any parent aborts, propagating the first parent's abort reason. Used to
 * compose the invocation-wide deadline with a command's injected
 * SIGINT/SIGTERM signal.
 */
export function combineSignals(...parents: (AbortSignal | undefined)[]): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const live = parents.filter((parent): parent is AbortSignal => parent !== undefined);
  const listeners: Array<{ signal: AbortSignal; handler: () => void }> = [];

  for (const parent of live) {
    const handler = () => controller.abort(parent.reason);
    listeners.push({ signal: parent, handler });
    if (parent.aborted) handler();
    else parent.addEventListener('abort', handler, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const { signal, handler } of listeners) {
        signal.removeEventListener('abort', handler);
      }
    },
  };
}

/**
 * Wraps an {@link CliIo} so stdout stops (and throws
 * {@link OutputLimitExceededError}) before exceeding `maxStdoutBytes`. When the
 * budget is absent the original `io` is returned unchanged. Byte counts use
 * UTF-8 encoding, matching the protocol boundary on the wire.
 */
export function boundedIo(io: CliIo, maxStdoutBytes: number | undefined): CliIo {
  if (maxStdoutBytes === undefined) return io;
  let written = 0;
  return {
    ...io,
    stdout: {
      write(chunk: string): void {
        const bytes = Buffer.byteLength(chunk, 'utf8');
        if (written + bytes > maxStdoutBytes) {
          throw new OutputLimitExceededError(maxStdoutBytes);
        }
        written += bytes;
        io.stdout.write(chunk);
      },
    },
  };
}

/**
 * Builds the {@link HttpFetchPolicy} for the invocation-wide network byte
 * budget, or `undefined` when no budget was supplied. The returned policy
 * carries one shared {@link HttpByteBudget} consumed across every core-fetched
 * request (feeds, articles, episode pages, Apple lookups, provider catalogs)
 * and the direct-media download path, so the flag bounds total invocation
 * download bytes rather than any single response.
 */
export function networkPolicyFromBytes(
  maxNetworkBytes: number | undefined,
): HttpFetchPolicy | undefined {
  return maxNetworkBytes === undefined
    ? undefined
    : { byteBudget: createHttpByteBudget(maxNetworkBytes) };
}

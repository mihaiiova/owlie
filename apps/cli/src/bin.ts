#!/usr/bin/env node
import { CancelledError } from '@owlieio/core';
import { run } from './cli.js';
import { colorize } from './style.js';

async function main(): Promise<void> {
  const controller = new AbortController();
  // Abort with a typed reason so cooperative consumers (including
  // `AbortSignal.throwIfAborted()`) surface cancellation rather than a bare
  // `AbortError`, producing the structured cancellation record and exit 130.
  const abort = () => controller.abort(new CancelledError('cancelled'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  // Exit quietly when a downstream pipe closes early (e.g. `owlie … | head`).
  const onPipeError = (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      process.exit(0);
    }
    throw error;
  };
  process.stdout.on('error', onPipeError);
  process.stderr.on('error', onPipeError);

  try {
    const code = await run(
      process.argv.slice(2),
      {
        stdout: { write: (chunk) => process.stdout.write(chunk) },
        stderr: {
          write: (chunk) => process.stderr.write(chunk),
          isTTY: Boolean(process.stderr.isTTY),
        },
        stdin: {
          isTTY: Boolean(process.stdin.isTTY),
          read: () =>
            new Promise((resolve, reject) => {
              let data = '';
              process.stdin.setEncoding('utf8');
              process.stdin.on('data', (chunk: string) => {
                data += chunk;
              });
              process.stdin.on('end', () => resolve(data));
              process.stdin.on('error', reject);
            }),
        },
      },
      {
        extract: { signal: controller.signal },
        list: { signal: controller.signal },
        process: { signal: controller.signal },
        resolve: { signal: controller.signal },
        models: { signal: controller.signal },
        setup: { signal: controller.signal },
      },
    );
    process.exitCode = code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${colorize('error', message, Boolean(process.stderr.isTTY))}\n`);
    process.exitCode = 1;
  }
}

void main();

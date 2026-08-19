#!/usr/bin/env node
import { run } from './cli.js';

async function main(): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
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
        stderr: { write: (chunk) => process.stderr.write(chunk) },
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
        process: { signal: controller.signal },
      },
    );
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`owlie: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();

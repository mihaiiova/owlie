#!/usr/bin/env node
import { run } from './cli.js';

async function main(): Promise<void> {
  try {
    const code = await run(process.argv.slice(2), {
      stdout: { write: (chunk) => process.stdout.write(chunk) },
      stderr: { write: (chunk) => process.stderr.write(chunk) },
    });
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`owlie: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();

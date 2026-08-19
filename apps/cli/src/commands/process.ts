import { readFile } from 'node:fs/promises';
import type { ContentProcessor, NormalizedDocument, ProcessRequest } from '@owlieio/core';
import { ConfigurationError, OwlieError } from '@owlieio/core';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { resolveProcessInput } from '../input.js';
import type { ProcessInputSource } from '../input.js';
import { resolveDeepSeekConfig } from '../config.js';
import type { DeepSeekEnvConfig } from '../config.js';
import { resolveProcessor } from '../registry.js';

export interface ProcessDeps {
  signal?: AbortSignal;
  /** Injected for tests; bypasses config/model resolution. */
  processor?: ContentProcessor;
  /** Injected for tests; bypasses environment loading. */
  config?: DeepSeekEnvConfig;
}

async function readInputFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new OwlieError(
      `cannot read input file "${path}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function textDocument(text: string): NormalizedDocument {
  return {
    schemaVersion: 1,
    id: 'text:input',
    sourceType: 'rss',
    canonicalUrl: '',
    mediaType: 'text',
    text,
    metadata: {},
  };
}

function parseDocument(json: string): NormalizedDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new OwlieError('input is not valid JSON (--input-format json)', { cause: error });
  }
  const doc = (parsed ?? {}) as Partial<NormalizedDocument>;
  if (typeof doc.text !== 'string' || doc.text.trim() === '') {
    throw new OwlieError('JSON input is missing a non-empty "text" field');
  }
  return {
    schemaVersion: 1,
    id: doc.id ?? 'text:input',
    sourceType: doc.sourceType ?? 'rss',
    canonicalUrl: doc.canonicalUrl ?? '',
    mediaType: doc.mediaType ?? 'text',
    title: doc.title,
    text: doc.text,
    publishedAt: doc.publishedAt,
    author: doc.author,
    metadata: doc.metadata ?? {},
  };
}

async function readDocument(
  source: ProcessInputSource,
  inputFormat: 'text' | 'json' | undefined,
): Promise<NormalizedDocument> {
  const raw = source.kind === 'stdin' ? source.content : await readInputFile(source.path);
  return inputFormat === 'json' ? parseDocument(raw) : textDocument(raw);
}

function resolveConfiguredProcessor(config: DeepSeekEnvConfig): ContentProcessor {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new ConfigurationError(
      'DEEPSEEK_API_KEY is not set (set it in the environment or a .env file)',
    );
  }
  return resolveProcessor(config.model, { apiKey: config.apiKey, baseUrl: config.baseUrl });
}

export async function runProcessCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ProcessDeps = {},
): Promise<number> {
  try {
    const stdinPiped = !io.stdin.isTTY;
    const needsStdinRead = stdinPiped && args[0] === undefined && options.input === undefined;
    const stdinContent = needsStdinRead ? await io.stdin.read() : undefined;

    const source = resolveProcessInput({
      positional: args[0],
      input: options.input,
      stdin: stdinPiped ? { isTTY: false, content: stdinContent ?? '' } : undefined,
    });

    const document = await readDocument(source, options.inputFormat);

    const config = deps.config ?? resolveDeepSeekConfig(options);
    const processor = deps.processor ?? resolveConfiguredProcessor(config);

    const request: ProcessRequest = { document, instruction: options.prompt };
    const result = await processor.process(request, { signal: deps.signal });

    if (options.json) {
      io.stdout.write(JSON.stringify(result) + '\n');
    } else {
      io.stdout.write(result.output + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`owlie: ${message}\n`);
    }
    return exitCodeForError(error);
  }
}

import { readFile } from 'node:fs/promises';
import type {
  CollectionAdapter,
  ContentProcessor,
  ItemAdapter,
  NormalizedDocument,
  ProcessRequest,
  ProgressSink,
} from '@owlieio/core';
import { CancelledError, ConfigurationError, OwlieError, listCollection } from '@owlieio/core';
import { RssAdapter } from '@owlieio/adapter-rss';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { resolveProcessInput } from '../input.js';
import type { ProcessInputSource } from '../input.js';
import { readUserConfig, resolveDeepSeekConfig } from '../config.js';
import type { DeepSeekEnvConfig, UserConfig } from '../config.js';
import { parseLanguages } from './extract.js';
import { extractLinkedItem, itemRef, toBatchError } from '../feed.js';
import { parseCollectionLimit } from '../limits.js';
import { defaultItemAdapters, resolveProcessor } from '../registry.js';
import { Spinner } from '../spinner.js';
import type { SpinnerLike } from '../spinner.js';

export interface ProcessDeps {
  signal?: AbortSignal;
  /** Injected for tests; bypasses config/model resolution. */
  processor?: ContentProcessor;
  /** Injected for tests; bypasses environment loading. */
  config?: DeepSeekEnvConfig;
  /** Ordered item adapters for linked-item dispatch (`--each` mode). */
  itemAdapters?: readonly ItemAdapter[];
  /** Collection adapter used to recognize and list RSS/Atom feeds. */
  feedAdapter?: CollectionAdapter;
  readConfig?: () => UserConfig;
  spinner?: SpinnerLike;
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
  const spinner =
    deps.spinner ??
    new Spinner({
      write: (text) => {
        if (!options.quiet) io.stderr.write(text);
      },
    });

  try {
    if (options.each) {
      return await runFeedProcessing(args, io, options, deps, spinner);
    }

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
    spinner.start('processing');
    const result = await processor.process(request, { signal: deps.signal });
    spinner.stop();

    if (options.json) {
      io.stdout.write(JSON.stringify(result) + '\n');
    } else {
      io.stdout.write(result.output + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    spinner.stop();
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`owlie: ${message}\n`);
    }
    return exitCodeForError(error);
  }
}

async function runFeedProcessing(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ProcessDeps,
  spinner: SpinnerLike,
): Promise<number> {
  const [url, extra] = args;
  if (url === undefined) {
    if (!options.quiet) io.stderr.write('owlie: --each requires a feed URL\n');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) io.stderr.write(`owlie: unexpected argument "${extra}"\n`);
    return ExitCode.Usage;
  }
  if (options.input !== undefined) {
    if (!options.quiet) io.stderr.write('owlie: --each cannot be combined with --input\n');
    return ExitCode.Usage;
  }
  if (!io.stdin.isTTY) {
    if (!options.quiet) io.stderr.write('owlie: --each cannot be combined with piped stdin\n');
    return ExitCode.Usage;
  }

  const readConfig = deps.readConfig ?? readUserConfig;
  const itemAdapters =
    deps.itemAdapters ??
    defaultItemAdapters({
      languages: parseLanguages(options.language),
      proxy: readConfig().proxy,
    });
  const feedAdapter = deps.feedAdapter ?? new RssAdapter();

  if (!feedAdapter.recognize({ url })) {
    if (!options.quiet)
      io.stderr.write(`owlie: --each requires an RSS/Atom feed URL, received "${url}"\n`);
    return ExitCode.Usage;
  }

  const config = deps.config ?? resolveDeepSeekConfig(options);
  const processor = deps.processor ?? resolveConfiguredProcessor(config);

  const limit = parseCollectionLimit(options.limit);
  spinner.start(`processing ${url}`);
  const result = await listCollection(feedAdapter, { url }, { limit, signal: deps.signal });

  let failed = false;
  const progress: ProgressSink = {
    emit: (event) => {
      if (event.type === 'started') spinner.update?.(`extracting ${event.target}`);
    },
  };

  for (const entry of result.items) {
    if (deps.signal?.aborted) throw new CancelledError('processing cancelled');
    const entryUrl = entry.canonicalUrl;
    const ref = itemRef(entryUrl, entry.title);
    try {
      const { document } = await extractLinkedItem({
        url: entryUrl,
        title: entry.title,
        itemAdapters,
        signal: deps.signal,
        progress,
      });
      try {
        const procResult = await processor.process(
          { document, instruction: options.prompt },
          { signal: deps.signal },
        );
        io.stdout.write(JSON.stringify({ item: ref, document, result: procResult }) + '\n');
      } catch (error) {
        if (error instanceof CancelledError || deps.signal?.aborted) throw error;
        failed = true;
        io.stdout.write(
          JSON.stringify({ item: ref, error: toBatchError(error, 'processing') }) + '\n',
        );
      }
    } catch (error) {
      if (error instanceof CancelledError || deps.signal?.aborted) throw error;
      failed = true;
      io.stdout.write(
        JSON.stringify({ item: ref, error: toBatchError(error, 'extraction') }) + '\n',
      );
    }
  }

  spinner.stop();
  return failed ? ExitCode.Error : ExitCode.Success;
}

import type {
  CollectionAdapter,
  ItemAdapter,
  NormalizedDocument,
  ProgressSink,
} from '@owlieio/core';
import {
  CancelledError,
  ConfigurationError,
  ExtractionError,
  OwlieError,
  extractItem,
  listCollection,
  resolveItem,
} from '@owlieio/core';
import { ArticleAdapter } from '@owlieio/adapter-article';
import { RssAdapter } from '@owlieio/adapter-rss';
import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { readUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { selectItemAdapter } from '../dispatch.js';
import { parseCollectionLimit } from '../limits.js';
import { summarizeCollection } from './list.js';
import { Spinner } from '../spinner.js';
import type { SpinnerLike } from '../spinner.js';

export interface ExtractDeps {
  /** Ordered item adapters for direct-URL dispatch (specialized first). */
  itemAdapters?: readonly ItemAdapter[];
  /** Collection adapter used to recognize and list RSS/Atom feeds. */
  feedAdapter?: CollectionAdapter;
  signal?: AbortSignal;
  readConfig?: () => UserConfig;
  spinner?: SpinnerLike;
}

/** Parses a comma-separated `--language` value into a priority list. */
export function parseLanguages(language?: string): string[] | undefined {
  if (!language) return undefined;
  const languages = language
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return languages.length > 0 ? languages : undefined;
}

/** A structured per-item extraction error in the feed envelope. */
export interface ExtractBatchError {
  code: string;
  message: string;
  stage: 'extraction';
}

/** One attempted feed entry: a document on success, or a structured error. */
export interface ExtractBatchItem {
  url: string;
  title?: string;
  document?: NormalizedDocument;
  error?: ExtractBatchError;
}

/** The single JSON envelope written by `owlie extract` for a feed URL. */
export interface ExtractBatchEnvelope {
  collection: ReturnType<typeof summarizeCollection>;
  items: ExtractBatchItem[];
  truncated: boolean;
}

function toExtractError(error: unknown): ExtractBatchError {
  const code = error instanceof OwlieError ? error.code : 'EXTRACTION_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  return { code, message, stage: 'extraction' };
}

/** A `{ url, title }` base record; title is omitted when absent. */
function baseItemRecord(url: string, title: string | undefined): { url: string; title?: string } {
  return title === undefined ? { url } : { url, title };
}

export async function runExtractCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ExtractDeps = {},
): Promise<number> {
  const [url, extra] = args;
  if (url === undefined) {
    if (!options.quiet) io.stderr.write('owlie: extract requires a URL\n');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) io.stderr.write(`owlie: unexpected argument "${extra}"\n`);
    return ExitCode.Usage;
  }

  const readConfig = deps.readConfig ?? readUserConfig;
  const itemAdapters = deps.itemAdapters ?? [
    new YouTubeAdapter({ languages: parseLanguages(options.language), proxy: readConfig().proxy }),
    new ArticleAdapter(),
  ];
  const feedAdapter = deps.feedAdapter ?? new RssAdapter();
  const spinner =
    deps.spinner ??
    new Spinner({
      write: (text) => {
        if (!options.quiet) io.stderr.write(text);
      },
    });

  try {
    if (feedAdapter.recognize({ url })) {
      return await runFeedExtraction(url, io, itemAdapters, feedAdapter, spinner, options, deps);
    }
    return await runDirectExtraction(url, io, itemAdapters, spinner, options, deps);
  } catch (error) {
    spinner.stop();
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`owlie: ${message}\n`);
    }
    return exitCodeForError(error);
  }
}

async function runDirectExtraction(
  url: string,
  io: CliIo,
  itemAdapters: readonly ItemAdapter[],
  spinner: SpinnerLike,
  options: CliOptions,
  deps: ExtractDeps,
): Promise<number> {
  const adapter = selectItemAdapter(itemAdapters, { url });
  if (!adapter) {
    throw new ConfigurationError(`no adapter recognizes URL: ${url}`);
  }
  const progress: ProgressSink = {
    emit: (event) => {
      if (event.type === 'started') spinner.start(`extracting ${event.target}`);
    },
  };
  const item = await resolveItem(adapter, { url });
  const document = await extractItem(adapter, item, {
    signal: deps.signal,
    progress,
  });
  spinner.stop();

  if (options.json) {
    io.stdout.write(JSON.stringify(document) + '\n');
  } else {
    io.stdout.write(document.text + '\n');
  }
  return ExitCode.Success;
}

async function runFeedExtraction(
  url: string,
  io: CliIo,
  itemAdapters: readonly ItemAdapter[],
  feedAdapter: CollectionAdapter,
  spinner: SpinnerLike,
  options: CliOptions,
  deps: ExtractDeps,
): Promise<number> {
  const limit = parseCollectionLimit(options.limit);
  spinner.start(`extracting ${url}`);
  const result = await listCollection(feedAdapter, { url }, { limit, signal: deps.signal });

  const items: ExtractBatchItem[] = [];
  let failed = false;
  const progress: ProgressSink = {
    emit: (event) => {
      if (event.type === 'started') spinner.update?.(`extracting ${event.target}`);
    },
  };

  for (const entry of result.items) {
    if (deps.signal?.aborted) throw new CancelledError('extraction cancelled');
    const entryUrl = entry.canonicalUrl;
    try {
      const adapter = selectItemAdapter(itemAdapters, { url: entryUrl });
      if (!adapter) {
        throw new ExtractionError(`no adapter recognizes linked URL: ${entryUrl}`);
      }
      const item = await resolveItem(adapter, { url: entryUrl });
      const document = await extractItem(adapter, item, {
        signal: deps.signal,
        progress,
      });
      items.push({ ...baseItemRecord(entryUrl, entry.title), document });
    } catch (error) {
      if (error instanceof CancelledError || deps.signal?.aborted) throw error;
      failed = true;
      items.push({ ...baseItemRecord(entryUrl, entry.title), error: toExtractError(error) });
    }
  }

  const envelope: ExtractBatchEnvelope = {
    collection: summarizeCollection(result.collection),
    items,
    truncated: result.truncated,
  };
  spinner.stop();
  io.stdout.write(JSON.stringify(envelope) + '\n');
  return failed ? ExitCode.Error : ExitCode.Success;
}

import type {
  CollectionAdapter,
  ContentItem,
  HttpFetcher,
  ItemAdapter,
  NormalizedDocument,
  ProgressSink,
  Transcriber,
} from '@owlieio/core';
import {
  assertNoUrlCredentials,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  listCollection,
} from '@owlieio/core';
import { RssAdapter } from '@owlieio/adapter-rss';
import { PodcastAdapter } from '@owlieio/adapter-podcast';
import { WhisperLocalTranscriber } from '@owlieio/provider-whisper';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { cacheDir, readUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { extractWithFallback } from '../dispatch.js';
import { extractLinkedItem, itemRef, toBatchError } from '../feed.js';
import { parseCollectionLimit } from '../limits.js';
import { defaultItemAdapters } from '../registry.js';
import { resolvePodcastAudio } from '../resolvers.js';
import { summarizeCollection } from './list.js';
import { Spinner } from '../spinner.js';
import type { SpinnerLike } from '../spinner.js';
import { writeDiagnostic } from '../style.js';

export interface ExtractDeps {
  /** Ordered item adapters for direct-URL dispatch (specialized first). */
  itemAdapters?: readonly ItemAdapter[];
  /** Collection adapter used to recognize and list RSS/Atom feeds. */
  feedAdapter?: CollectionAdapter;
  signal?: AbortSignal;
  readConfig?: () => UserConfig;
  spinner?: SpinnerLike;
  /** Fetcher used by explicit resolver-selection flag extraction. */
  fetcher?: HttpFetcher;
  /** Transcriber used by explicit resolver-selection flag extraction. */
  transcriber?: Transcriber;
  /** Cache directory used by explicit resolver-selection flag extraction. */
  cacheDir?: string;
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

function parsePositiveInteger(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new ConfigurationError(`${flag} must be a positive integer`);
  }
  return Number(value);
}

/** Combines process cancellation with the extract command's single operation deadline. */
function deadlineSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number | undefined,
): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
} {
  if (timeoutMs === undefined) return { signal: parent, cleanup: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  timer.unref();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

function toExtractError(error: unknown): ExtractBatchError {
  return toBatchError(error, 'extraction');
}

export async function runExtractCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ExtractDeps = {},
): Promise<number> {
  const [url, extra] = args;
  if (url === undefined) {
    if (!options.quiet) writeDiagnostic(io, 'warning', 'extract requires a URL');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) writeDiagnostic(io, 'warning', `unexpected argument "${extra}"`);
    return ExitCode.Usage;
  }

  let timeoutMs: number | undefined;
  let maxMediaBytes: number | undefined;
  try {
    timeoutMs = parsePositiveInteger(options.timeoutMs, '--timeout-ms');
    maxMediaBytes = parsePositiveInteger(options.maxMediaBytes, '--max-media-bytes');
  } catch (error) {
    if (!options.quiet) writeDiagnostic(io, 'warning', (error as Error).message);
    return ExitCode.Usage;
  }

  const readConfig = deps.readConfig ?? readUserConfig;

  if (options.resolver !== undefined) {
    return runResolverExtraction(
      url,
      io,
      options,
      deps,
      options.resolver,
      readConfig,
      timeoutMs,
      maxMediaBytes,
    );
  }

  const itemAdapters =
    deps.itemAdapters ??
    defaultItemAdapters({
      languages: parseLanguages(options.language),
      proxy: readConfig().proxy,
      cacheDir: cacheDir(),
      whisperModel: readConfig().transcription?.model,
      mediaMaxBytes: maxMediaBytes,
    });
  const feedAdapter = deps.feedAdapter ?? new RssAdapter();
  const spinner =
    deps.spinner ??
    new Spinner({
      write: (text) => {
        if (!options.quiet) io.stderr.write(text);
      },
      tty: io.stderr.isTTY,
    });

  try {
    if (feedAdapter.recognize({ url })) {
      return await runFeedExtraction(url, io, itemAdapters, feedAdapter, spinner, options, deps);
    }
    return await runDirectExtraction(url, io, itemAdapters, spinner, options, deps, timeoutMs);
  } catch (error) {
    spinner.stop();
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      writeDiagnostic(io, 'error', message);
    }
    return exitCodeForError(error);
  }
}

/** stderr notice when a URL defers from audio resolution to article text. */
export const ARTICLE_FALLBACK_NOTICE = 'extracting article text';

async function runDirectExtraction(
  url: string,
  io: CliIo,
  itemAdapters: readonly ItemAdapter[],
  spinner: SpinnerLike,
  options: CliOptions,
  deps: ExtractDeps,
  timeoutMs: number | undefined,
): Promise<number> {
  assertNoUrlCredentials(url);
  const progress: ProgressSink = {
    emit: (event) => {
      if (event.type === 'started') spinner.start(`extracting ${event.target}`);
      else if (event.type === 'progress' && event.message) spinner.update?.(event.message);
    },
  };
  const operation = deadlineSignal(deps.signal, timeoutMs);
  let document: NormalizedDocument;
  try {
    ({ document } = await extractWithFallback(
      itemAdapters,
      { url },
      {
        signal: operation.signal,
        progress,
        onFallback: () => {
          if (!options.quiet) {
            writeDiagnostic(io, 'info', ARTICLE_FALLBACK_NOTICE);
          }
        },
      },
    ));
  } finally {
    operation.cleanup();
  }
  spinner.stop();

  if (options.json) {
    io.stdout.write(JSON.stringify(document) + '\n');
  } else {
    io.stdout.write(document.text + '\n');
  }
  return ExitCode.Success;
}

/**
 * Runs an explicitly selected audio resolver: resolve → download → transcribe.
 * The selected resolver is authoritative — a URL it does not recognize is a
 * usage error, and a resolution failure does not fall back to another resolver
 * or the article adapter.
 */
async function runResolverExtraction(
  url: string,
  io: CliIo,
  options: CliOptions,
  deps: ExtractDeps,
  resolverName: string,
  readConfig: () => UserConfig,
  timeoutMs: number | undefined,
  maxMediaBytes: number | undefined,
): Promise<number> {
  const fetcher = deps.fetcher ?? new DefaultHttpFetcher();
  const transcriber =
    deps.transcriber ?? new WhisperLocalTranscriber({ model: readConfig().transcription?.model });
  const workCacheDir = deps.cacheDir ?? cacheDir();
  const spinner =
    deps.spinner ??
    new Spinner({
      write: (text) => {
        if (!options.quiet) io.stderr.write(text);
      },
      tty: io.stderr.isTTY,
    });

  const operation = deadlineSignal(deps.signal, timeoutMs);
  try {
    assertNoUrlCredentials(url);
    const resolved = await resolvePodcastAudio(url, {
      fetcher,
      resolverName,
      signal: operation.signal,
    });
    const item: ContentItem = {
      id: `podcast:episode:${resolved.mediaUrl}`,
      sourceType: 'podcast',
      canonicalUrl: resolved.mediaUrl,
      metadata: { platform: 'podcast', ...(resolved.metadata ?? {}) },
    };
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber,
      cacheDir: workCacheDir,
      mediaFetchPolicy:
        maxMediaBytes === undefined ? undefined : { maxResponseBytes: maxMediaBytes },
    });
    const progress: ProgressSink = {
      emit: (event) => {
        if (event.type === 'started') spinner.start(`extracting ${event.target}`);
        else if (event.type === 'progress' && event.message) spinner.update?.(event.message);
      },
    };
    const document = await adapter.extract(item, { signal: operation.signal, progress });
    spinner.stop();

    if (options.json) {
      io.stdout.write(JSON.stringify(document) + '\n');
    } else {
      io.stdout.write(document.text + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    spinner.stop();
    if (error instanceof ConfigurationError) {
      if (!options.quiet) writeDiagnostic(io, 'warning', error.message);
      return ExitCode.Usage;
    }
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      writeDiagnostic(io, 'error', message);
    }
    return exitCodeForError(error);
  } finally {
    operation.cleanup();
  }
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
  spinner.start('extracting feed');
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
      const outcome = await extractLinkedItem({
        url: entryUrl,
        title: entry.title,
        itemAdapters,
        signal: deps.signal,
        progress,
      });
      items.push(outcome);
    } catch (error) {
      if (error instanceof CancelledError || deps.signal?.aborted) throw error;
      failed = true;
      items.push({ ...itemRef(entryUrl, entry.title), error: toExtractError(error) });
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

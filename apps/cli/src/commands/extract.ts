import type {
  CollectionAdapter,
  ContentItem,
  HttpFetcher,
  HttpFetchPolicy,
  ItemAdapter,
  NormalizedDocument,
  Transcriber,
} from '@owlieio/core';
import {
  assertNoUrlCredentials,
  CancelledError,
  ConfigurationError,
  DefaultHttpFetcher,
  listCollection,
  NotHandledError,
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
import { extractLinkedItem, itemRef, resolveFeedCollectionUrl, toBatchError } from '../feed.js';
import { parseCollectionLimit } from '../limits.js';
import { defaultItemAdapters } from '../registry.js';
import { resolvePodcastAudio } from '../resolvers.js';
import { summarizeCollection } from './list.js';
import {
  createCommandSpinner,
  createProgressSink,
  redactUrl,
  writeCommandError,
  writeResultEnvelope,
  writeTerminalRecord,
  writeUsageError,
} from '../protocol.js';
import { finalizeDocument, ARTICLE_FALLBACK_WARNING } from '../provenance.js';
import type { SpinnerLike } from '../spinner.js';
import { writeDiagnostic } from '../style.js';
import { parsePositiveIntegerFlag } from '../invocation.js';

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
  /** Invocation-wide network fetch policy (max download bytes). */
  networkPolicy?: HttpFetchPolicy;
  /** Injected CLI-boundary clock for the provenance `fetchedAt` stamp. */
  clock?: () => Date;
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
    if (!options.quiet) writeUsageError(io, options, 'extract', 'extract requires a URL');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) writeUsageError(io, options, 'extract', `unexpected argument "${extra}"`);
    return ExitCode.Usage;
  }

  let maxMediaBytes: number | undefined;
  try {
    maxMediaBytes = parsePositiveIntegerFlag(options.maxMediaBytes, '--max-media-bytes');
  } catch (error) {
    if (!options.quiet) writeUsageError(io, options, 'extract', (error as Error).message);
    return ExitCode.Usage;
  }

  const readConfig: () => UserConfig = options.hosted
    ? () => ({})
    : (deps.readConfig ?? readUserConfig);

  if (options.resolver !== undefined) {
    return runResolverExtraction(
      url,
      io,
      options,
      deps,
      options.resolver,
      readConfig,
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
      networkPolicy: deps.networkPolicy,
    });
  const feedAdapter = deps.feedAdapter ?? new RssAdapter({ policy: deps.networkPolicy });
  const spinner = createCommandSpinner(io, options, deps.spinner);

  try {
    if (feedAdapter.recognize({ url })) {
      return await runFeedExtraction(url, io, itemAdapters, feedAdapter, spinner, options, deps);
    }
    return await runDirectOrDiscoveredExtraction(
      url,
      io,
      itemAdapters,
      feedAdapter,
      spinner,
      options,
      deps,
    );
  } catch (error) {
    spinner.stop();
    writeCommandError(io, options, 'extract', error);
    return exitCodeForError(error);
  }
}

/** stderr notice when a URL defers from audio resolution to article text. */
export const ARTICLE_FALLBACK_NOTICE = ARTICLE_FALLBACK_WARNING.message;

/** Whether an error means "no item adapter recognized this URL". */
function isNoAdapterConfigurationError(error: unknown): boolean {
  return (
    error instanceof ConfigurationError && error.message.startsWith('no adapter recognizes URL')
  );
}

/**
 * Routes a non-feed URL through the specialized item adapters (YouTube,
 * podcast). When none handles it — the article adapter is no longer a
 * top-level fallback for `extract` — the command attempts bounded collection
 * discovery instead and fails with a clear discovery error when no feed is
 * found.
 */
async function runDirectOrDiscoveredExtraction(
  url: string,
  io: CliIo,
  itemAdapters: readonly ItemAdapter[],
  feedAdapter: CollectionAdapter,
  spinner: SpinnerLike,
  options: CliOptions,
  deps: ExtractDeps,
): Promise<number> {
  const specialized = itemAdapters.filter((adapter) => adapter.sourceType !== 'article');
  try {
    return await runDirectExtraction(url, io, specialized, spinner, options, deps);
  } catch (error) {
    if (!(error instanceof NotHandledError) && !isNoAdapterConfigurationError(error)) {
      throw error;
    }
    const feedUrl = await resolveFeedCollectionUrl(feedAdapter, url, deps.signal);
    return await runFeedExtraction(feedUrl, io, itemAdapters, feedAdapter, spinner, options, deps);
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
  assertNoUrlCredentials(url);
  const progress = createProgressSink(io, options, 'extract', (event) => {
    if (event.type === 'started') spinner.start(`extracting ${event.target}`);
    else if (event.type === 'progress' && event.message) spinner.update?.(event.message);
  });
  const { document } = await extractWithFallback(
    itemAdapters,
    { url },
    {
      signal: deps.signal,
      progress,
      clock: deps.clock,
    },
  );
  spinner.stop();

  if (options.json) {
    writeResultEnvelope(io, 'extract', document);
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
  maxMediaBytes: number | undefined,
): Promise<number> {
  const fetcher = deps.fetcher ?? new DefaultHttpFetcher();
  const transcriber =
    deps.transcriber ?? new WhisperLocalTranscriber({ model: readConfig().transcription?.model });
  const workCacheDir = deps.cacheDir ?? cacheDir();
  const spinner = createCommandSpinner(io, options, deps.spinner);
  const fetchedAt = (deps.clock?.() ?? new Date()).toISOString();

  try {
    assertNoUrlCredentials(url);
    const resolved = await resolvePodcastAudio(url, {
      fetcher,
      resolverName,
      signal: deps.signal,
      policy: deps.networkPolicy,
    });
    const item: ContentItem = {
      id: `podcast:episode:${redactUrl(url)}`,
      sourceType: 'podcast',
      canonicalUrl: resolved.mediaUrl,
      metadata: { platform: 'podcast', ...(resolved.metadata ?? {}) },
    };
    const adapter = new PodcastAdapter({
      fetcher,
      transcriber,
      cacheDir: workCacheDir,
      mediaFetchPolicy: {
        ...(deps.networkPolicy ?? {}),
        ...(maxMediaBytes === undefined ? {} : { maxResponseBytes: maxMediaBytes }),
      },
    });
    const progress = createProgressSink(io, options, 'extract', (event) => {
      if (event.type === 'started') spinner.start(`extracting ${event.target}`);
      else if (event.type === 'progress' && event.message) spinner.update?.(event.message);
    });
    const extracted = await adapter.extract(item, { signal: deps.signal, progress, fetchedAt });
    const document = finalizeDocument(extracted, {
      adapterId: adapter.id,
      fetchedAt,
      resolverId: resolverName,
      // Source identity derives from the canonical supplied locator, never the
      // resolved (possibly signed) media URL.
      sourceId: `podcast:episode:${redactUrl(url)}`,
      canonicalUrl: url,
    });
    spinner.stop();

    if (options.json) {
      writeResultEnvelope(io, 'extract', document);
    } else {
      io.stdout.write(document.text + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    spinner.stop();
    if (error instanceof ConfigurationError) {
      if (!options.quiet) {
        if (options.json) writeTerminalRecord(io, 'extract', error);
        else writeDiagnostic(io, 'warning', error.message);
      }
      return exitCodeForError(error);
    }
    writeCommandError(io, options, 'extract', error);
    return exitCodeForError(error);
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

  for (const [index, entry] of result.items.entries()) {
    if (deps.signal?.aborted) throw new CancelledError('extraction cancelled');
    const position = index + 1;
    const entryUrl = entry.canonicalUrl;
    const progress = createProgressSink(io, options, 'extract', (event) => {
      if (event.type === 'started')
        spinner.update?.(`extracting [${position}/${result.items.length}] ${event.target}`);
      else if (event.type === 'progress' && event.message) spinner.update?.(event.message);
    });
    try {
      const outcome = await extractLinkedItem({
        url: entryUrl,
        title: entry.title,
        itemAdapters,
        signal: deps.signal,
        progress,
        clock: deps.clock,
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
  writeResultEnvelope(io, 'extract', envelope);
  return failed ? ExitCode.Error : ExitCode.Success;
}

import type {
  CollectionAdapter,
  CollectionListResult,
  ContentCollection,
  ContentItem,
} from '@owlieio/core';
import { assertNoUrlCredentials, listCollection } from '@owlieio/core';
import { RssAdapter } from '@owlieio/adapter-rss';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { parseCollectionLimit } from '../limits.js';
import {
  createCommandSpinner,
  writeCommandError,
  writeResultEnvelope,
  writeUsageError,
} from '../protocol.js';
import type { SpinnerLike } from '../spinner.js';

/** Injectable seams for `owlie list` (tests substitute an offline adapter). */
export interface ListDeps {
  adapter?: CollectionAdapter;
  signal?: AbortSignal;
  spinner?: SpinnerLike;
}

/** A safe, HTML-free summary of one listed item. */
export interface ListItemSummary {
  id: string;
  sourceType: string;
  canonicalUrl: string;
  title?: string;
  description?: string;
  publishedAt?: string;
  author?: string;
}

/** A safe, HTML-free summary of the listed collection. */
export interface ListCollectionSummary {
  id: string;
  sourceType: string;
  canonicalUrl: string;
  title?: string;
  metadata: Record<string, unknown>;
}

/** The single JSON envelope written by `owlie list --json`. */
export interface ListEnvelope {
  collection: ListCollectionSummary;
  items: ListItemSummary[];
  truncated: boolean;
}

/**
 * Parses a raw `--limit` value into a bounded positive integer, defaulting to
 * the core collection limit when absent and rejecting invalid or oversized
 * values with a {@link ConfigurationError}.
 *
 * @deprecated Use {@link parseCollectionLimit} directly; kept for the public
 * CLI API and existing callers.
 */
export function parseListLimit(raw: string | undefined): number {
  return parseCollectionLimit(raw);
}

export function summarizeCollection(collection: ContentCollection): ListCollectionSummary {
  assertNoUrlCredentials(collection.canonicalUrl);
  const summary: ListCollectionSummary = {
    id: collection.id,
    sourceType: collection.sourceType,
    canonicalUrl: collection.canonicalUrl,
    metadata: collection.metadata,
  };
  if (collection.title) summary.title = collection.title;
  return summary;
}

export function summarizeItem(item: ContentItem): ListItemSummary {
  assertNoUrlCredentials(item.canonicalUrl);
  const summary: ListItemSummary = {
    id: item.id,
    sourceType: item.sourceType,
    canonicalUrl: item.canonicalUrl,
  };
  if (item.title) summary.title = item.title;
  if (item.description) summary.description = item.description;
  if (item.publishedAt) summary.publishedAt = item.publishedAt;
  if (item.author) summary.author = item.author;
  return summary;
}

export function buildEnvelope(result: CollectionListResult): ListEnvelope {
  return {
    collection: summarizeCollection(result.collection),
    items: result.items.map(summarizeItem),
    truncated: result.truncated,
  };
}

/** Stable, line-oriented human summary that never exposes raw entry HTML. */
export function formatListSummary(envelope: ListEnvelope): string {
  const lines: string[] = [envelope.collection.title ?? envelope.collection.canonicalUrl];
  for (const item of envelope.items) {
    const label = item.title ?? item.id;
    const meta = [item.publishedAt, item.author].filter((value): value is string => Boolean(value));
    const suffix = meta.length > 0 ? ` (${meta.join(' · ')})` : '';
    lines.push(`${label} — ${item.canonicalUrl}${suffix}`);
  }
  return lines.join('\n') + '\n';
}

export async function runListCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: ListDeps = {},
): Promise<number> {
  const [url, extra] = args;
  if (url === undefined) {
    if (!options.quiet) writeUsageError(io, options, 'list', 'list requires a URL');
    return ExitCode.Usage;
  }
  if (extra !== undefined) {
    if (!options.quiet) writeUsageError(io, options, 'list', `unexpected argument "${extra}"`);
    return ExitCode.Usage;
  }

  const adapter = deps.adapter ?? new RssAdapter();
  const spinner = createCommandSpinner(io, options, deps.spinner);

  try {
    const limit = parseListLimit(options.limit);
    spinner.start('listing feed');
    const result = await listCollection(adapter, { url }, { limit, signal: deps.signal });
    const envelope = buildEnvelope(result);
    spinner.stop();

    if (options.json) {
      writeResultEnvelope(io, 'list', envelope);
    } else {
      io.stdout.write(formatListSummary(envelope));
    }
    return ExitCode.Success;
  } catch (error) {
    spinner.stop();
    writeCommandError(io, options, 'list', error);
    return exitCodeForError(error);
  }
}

import type { ItemAdapter, NormalizedDocument, ProgressSink } from '@owlieio/core';
import {
  assertNoUrlCredentials,
  ExtractionError,
  OwlieError,
  extractItem,
  resolveItem,
} from '@owlieio/core';
import { selectItemAdapter } from './dispatch.js';

/** A successfully extracted linked item, keyed by its URL and title. */
export interface LinkedItemResult {
  url: string;
  title?: string;
  document: NormalizedDocument;
}

/**
 * Dispatches one linked URL through the universal specialized-then-article
 * rule and extracts it into a {@link NormalizedDocument}. Throws on an
 * unrecognized URL or an extraction failure; cancellation propagates.
 */
export async function extractLinkedItem(opts: {
  url: string;
  title?: string;
  itemAdapters: readonly ItemAdapter[];
  signal?: AbortSignal;
  progress?: ProgressSink;
}): Promise<LinkedItemResult> {
  assertNoUrlCredentials(opts.url);
  const adapter = selectItemAdapter(opts.itemAdapters, { url: opts.url });
  if (!adapter) {
    throw new ExtractionError(`no adapter recognizes linked URL: ${opts.url}`);
  }
  const item = await resolveItem(adapter, { url: opts.url });
  const document = await extractItem(adapter, item, {
    signal: opts.signal,
    progress: opts.progress,
  });
  return { url: opts.url, ...(opts.title !== undefined ? { title: opts.title } : {}), document };
}

/** A `{ url, title }` reference; title is omitted when absent. */
export function itemRef(url: string, title: string | undefined): { url: string; title?: string } {
  assertNoUrlCredentials(url);
  return title === undefined ? { url } : { url, title };
}

/** A structured batch error with a stable code, message, and stage. */
export function toBatchError<S extends 'extraction' | 'processing'>(
  error: unknown,
  stage: S,
): { code: string; message: string; stage: S } {
  const code =
    error instanceof OwlieError
      ? error.code
      : stage === 'extraction'
        ? 'EXTRACTION_ERROR'
        : 'PROCESSING_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  return { code, message, stage };
}

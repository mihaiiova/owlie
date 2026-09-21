import type {
  ContentItem,
  ContentLocator,
  DeferredResponseItemAdapter,
  ExtractionWarning,
  ItemAdapter,
  NormalizedDocument,
  ProgressSink,
} from '@owlieio/core';
import { ConfigurationError, NotHandledError, extractItem, resolveItem } from '@owlieio/core';
import { finalizeDocument, ARTICLE_FALLBACK_WARNING } from './provenance.js';

/**
 * Registry-driven item dispatch: returns the first adapter whose `recognize`
 * accepts the locator, preserving the caller's adapter order (specialized
 * adapters first, generic fallbacks last). Pure and network-free.
 */
export function selectItemAdapter(
  adapters: readonly ItemAdapter[],
  locator: ContentLocator,
): ItemAdapter | undefined {
  return adapters.find((adapter) => adapter.recognize(locator));
}

/** Options for fallback-aware resolve+extract dispatch. */
export interface ExtractWithFallbackOptions {
  signal?: AbortSignal;
  progress?: ProgressSink;
  /** Invoked when a recognizing adapter defers to the next adapter. */
  onFallback?: (error: NotHandledError) => void;
  /** Injected CLI-boundary clock for the single provenance `fetchedAt` stamp. */
  clock?: () => Date;
}

function canConsumeDeferredResponse(
  adapter: ItemAdapter,
): adapter is ItemAdapter & DeferredResponseItemAdapter {
  return typeof (adapter as unknown as DeferredResponseItemAdapter).extractDeferred === 'function';
}

/**
 * Resolves and extracts a locator by trying each recognizing adapter in order.
 * An adapter that recognizes the locator's shape but cannot actually handle it
 * throws {@link NotHandledError}, which defers to the next adapter (for example
 * a generic episode page with no audio enclosure falls back to the article
 * adapter). When the deferral carries an already safe-fetched response and the
 * next adapter can consume it, that response is reused instead of re-fetching.
 * Every other error propagates.
 */
export async function extractWithFallback(
  adapters: readonly ItemAdapter[],
  locator: ContentLocator,
  options: ExtractWithFallbackOptions = {},
): Promise<{ item: ContentItem; document: NormalizedDocument }> {
  const candidates = adapters.filter((adapter) => adapter.recognize(locator));
  // Stamp once before the adapter attempts. A fallback must preserve the same
  // CLI-boundary time rather than acquiring a timestamp from its own fetch hop.
  const fetchedAt = (options.clock?.() ?? new Date()).toISOString();
  let deferred: NotHandledError | undefined;
  const fallbackWarnings: ExtractionWarning[] = [];
  for (const adapter of candidates) {
    try {
      const item = await resolveItem(adapter, locator, { signal: options.signal });
      const document = await (deferred?.deferredResponse && canConsumeDeferredResponse(adapter)
        ? adapter.extractDeferred(item, deferred.deferredResponse, {
            signal: options.signal,
            progress: options.progress,
            fetchedAt,
          })
        : extractItem(adapter, item, {
            signal: options.signal,
            progress: options.progress,
            fetchedAt,
          }));
      return {
        item,
        document: finalizeDocument(document, {
          adapterId: adapter.id,
          fetchedAt,
          warnings: fallbackWarnings,
        }),
      };
    } catch (error) {
      if (error instanceof NotHandledError) {
        deferred = error;
        fallbackWarnings.push(ARTICLE_FALLBACK_WARNING);
        options.onFallback?.(error);
        continue;
      }
      throw error;
    }
  }
  if (deferred) throw deferred;
  throw new ConfigurationError(`no adapter recognizes URL: ${locator.url}`);
}

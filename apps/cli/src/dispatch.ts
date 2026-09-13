import type {
  ContentItem,
  ContentLocator,
  ItemAdapter,
  NormalizedDocument,
  ProgressSink,
} from '@owlieio/core';
import { ConfigurationError, NotHandledError, extractItem, resolveItem } from '@owlieio/core';

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
}

/**
 * Resolves and extracts a locator by trying each recognizing adapter in order.
 * An adapter that recognizes the locator's shape but cannot actually handle it
 * throws {@link NotHandledError}, which defers to the next adapter (for example
 * a generic episode page with no audio enclosure falls back to the article
 * adapter). Every other error propagates.
 */
export async function extractWithFallback(
  adapters: readonly ItemAdapter[],
  locator: ContentLocator,
  options: ExtractWithFallbackOptions = {},
): Promise<{ item: ContentItem; document: NormalizedDocument }> {
  const candidates = adapters.filter((adapter) => adapter.recognize(locator));
  let deferred: NotHandledError | undefined;
  for (const adapter of candidates) {
    try {
      const item = await resolveItem(adapter, locator, { signal: options.signal });
      const document = await extractItem(adapter, item, {
        signal: options.signal,
        progress: options.progress,
      });
      return { item, document };
    } catch (error) {
      if (error instanceof NotHandledError) {
        deferred = error;
        options.onFallback?.(error);
        continue;
      }
      throw error;
    }
  }
  if (deferred) throw deferred;
  throw new ConfigurationError(`no adapter recognizes URL: ${locator.url}`);
}

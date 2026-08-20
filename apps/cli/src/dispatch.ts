import type { ContentLocator, ItemAdapter } from '@owlieio/core';

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

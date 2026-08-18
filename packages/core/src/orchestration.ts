import type {
  CollectionAdapter,
  CollectionListOptions,
  CollectionListResult,
  ExtractionOptions,
  ItemAdapter,
} from './contracts.js';
import { ConfigurationError } from './errors.js';
import type { ContentItem, ContentLocator, NormalizedDocument } from './types.js';

/**
 * Small orchestration helpers that compose adapters with cancellation and
 * keep the CLI (and tests) free of per-adapter plumbing.
 */

export async function listCollection(
  adapter: CollectionAdapter,
  locator: ContentLocator,
  options: CollectionListOptions,
): Promise<CollectionListResult> {
  options.signal?.throwIfAborted();
  const collection = await adapter.resolve(locator);
  options.signal?.throwIfAborted();
  return adapter.list(collection, options);
}

export async function resolveItem(
  adapter: ItemAdapter,
  locator: ContentLocator,
): Promise<ContentItem> {
  if (!adapter.resolveItem) {
    throw new ConfigurationError(`adapter "${adapter.id}" cannot resolve item locators`);
  }
  return adapter.resolveItem(locator);
}

export async function extractItem(
  adapter: ItemAdapter,
  item: ContentItem,
  options: ExtractionOptions = {},
): Promise<NormalizedDocument> {
  options.signal?.throwIfAborted();
  return adapter.extract(item, options);
}

import { ConfigurationError, resolveLimit } from '@owlieio/core';

/**
 * Parses a raw `--limit` value into a bounded positive integer, defaulting to
 * the core collection limit when absent and rejecting invalid or oversized
 * values with a {@link ConfigurationError}. Shared by every collection-capable
 * command (`owlie list`, and `owlie extract` on RSS/Atom feeds).
 */
export function parseCollectionLimit(raw: string | undefined): number {
  if (raw === undefined) return resolveLimit(undefined);
  if (!/^\d+$/.test(raw)) {
    throw new ConfigurationError(`limit must be a positive integer, received "${raw}"`);
  }
  return resolveLimit(Number(raw));
}

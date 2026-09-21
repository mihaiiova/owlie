import type {
  ContentCollection,
  ContentItem,
  DocumentProvenance,
  NormalizedDocument,
  SourceType,
} from '@owlieio/core';
import { buildProvenance } from '@owlieio/core';
import type { BuildProvenanceInput } from '@owlieio/core';

/** Stable timestamp used by fixtures so fingerprints and timestamps are deterministic. */
export const FIXTURE_FETCHED_AT = '2026-09-21T00:00:00.000Z';

export function makeCollection(overrides: Partial<ContentCollection> = {}): ContentCollection {
  return {
    id: 'test:collection:1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/feed.xml',
    metadata: {},
    ...overrides,
  };
}

export function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'test:item:1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/1',
    metadata: {},
    ...overrides,
  };
}

export function makeProvenance(overrides: Partial<BuildProvenanceInput> = {}): DocumentProvenance {
  return buildProvenance({
    sourceId: 'test:document:1',
    canonicalUrl: 'https://example.com/1',
    adapterId: 'test',
    text: 'hello world',
    fetchedAt: FIXTURE_FETCHED_AT,
    ...overrides,
  });
}

export function makeDocument(overrides: Partial<NormalizedDocument> = {}): NormalizedDocument {
  const base: NormalizedDocument = {
    schemaVersion: 2,
    id: 'test:document:1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/1',
    mediaType: 'text',
    text: 'hello world',
    metadata: {},
    provenance: makeProvenance(),
    ...overrides,
  };
  // Recompute provenance from the final text unless the caller supplied one,
  // so fixture fingerprints never go stale after a `text` override.
  if (overrides.provenance === undefined) {
    base.provenance = makeProvenance({
      sourceId: base.id,
      canonicalUrl: base.canonicalUrl,
      text: base.text,
    });
  }
  return base;
}

export function makeSourceType(value: SourceType): SourceType {
  return value;
}

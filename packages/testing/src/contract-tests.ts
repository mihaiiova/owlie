import { describe, expect, it } from 'vitest';
import type { CollectionAdapter, ContentProcessor, ItemAdapter, Transcriber } from '@owlieio/core';
import type { ContentLocator } from '@owlieio/core';
import { makeDocument } from './fixtures.js';

/**
 * Contract-test helpers. Import from `@owlieio/testing/contract-tests` and call
 * these inside a Vitest test file to verify that an implementation satisfies
 * the corresponding contract in `@owlieio/core`.
 */

export function collectionAdapterContract(
  name: string,
  createAdapter: () => CollectionAdapter,
  sampleLocator: ContentLocator,
): void {
  describe(`${name} (collection adapter contract)`, () => {
    it('recognizes its own locator', () => {
      expect(createAdapter().recognize(sampleLocator)).toBe(true);
    });

    it('resolves a canonical collection with a stable identity', async () => {
      const adapter = createAdapter();
      const collection = await adapter.resolve(sampleLocator);
      expect(collection.id).toBeTruthy();
      expect(collection.sourceType).toBe(adapter.sourceType);
      expect(collection.canonicalUrl).toBeTruthy();
    });

    it('lists bounded items with stable, unique identities', async () => {
      const adapter = createAdapter();
      const collection = await adapter.resolve(sampleLocator);
      const result = await adapter.list(collection, { limit: 3 });
      expect(result.items.length).toBeLessThanOrEqual(3);
      const ids = result.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('rejects unbounded limits', async () => {
      const adapter = createAdapter();
      const collection = await adapter.resolve(sampleLocator);
      await expect(adapter.list(collection, { limit: 0 })).rejects.toThrow();
    });
  });
}

export function itemAdapterContract(
  name: string,
  createAdapter: () => ItemAdapter,
  sampleLocator: ContentLocator,
): void {
  describe(`${name} (item adapter contract)`, () => {
    it('recognizes its own locator', () => {
      expect(createAdapter().recognize(sampleLocator)).toBe(true);
    });

    it('resolves an item with a stable identity', async () => {
      const adapter = createAdapter();
      const item = await adapter.resolveItem?.(sampleLocator);
      expect(item).toBeDefined();
      expect(item?.id).toBeTruthy();
    });

    it('extracts a normalized document', async () => {
      const adapter = createAdapter();
      const item = await adapter.resolveItem?.(sampleLocator);
      expect(item).toBeDefined();
      if (!item) return;
      const doc = await adapter.extract(item);
      expect(doc.schemaVersion).toBe(1);
      expect(doc.text.length).toBeGreaterThan(0);
    });
  });
}

export function processorContract(name: string, createProcessor: () => ContentProcessor): void {
  describe(`${name} (processor contract)`, () => {
    it('returns a ProcessResult with a valid format', async () => {
      const result = await createProcessor().process({ document: makeDocument() });
      expect(['text', 'markdown', 'json']).toContain(result.format);
      expect(typeof result.output).toBe('string');
    });

    it('always returns a metadata object', async () => {
      const result = await createProcessor().process({ document: makeDocument() });
      expect(result.metadata).toBeDefined();
    });
  });
}

export function transcriberContract(name: string, createTranscriber: () => Transcriber): void {
  describe(`${name} (transcriber contract)`, () => {
    it('produces non-empty text', async () => {
      const result = await createTranscriber().transcribe({
        mediaUrl: 'https://example.com/audio.mp3',
        metadata: {},
      });
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    });
  });
}

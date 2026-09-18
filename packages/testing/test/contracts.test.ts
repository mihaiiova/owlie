import {
  FakeCollectionAdapter,
  FakeContentProcessor,
  FakeItemAdapter,
  FakeProgressSink,
  FakeProviderCatalog,
  FakeTranscriber,
} from '@owlieio/testing';
import {
  catalogContract,
  collectionAdapterContract,
  itemAdapterContract,
  processorContract,
  transcriberContract,
} from '@owlieio/testing/contract-tests';
import { describe, expect, it } from 'vitest';

collectionAdapterContract('FakeCollectionAdapter', () => new FakeCollectionAdapter(), {
  url: 'https://example.com/feed.xml',
});

itemAdapterContract('FakeItemAdapter', () => new FakeItemAdapter(), {
  url: 'https://example.com/item/1',
});

processorContract('FakeContentProcessor', () => new FakeContentProcessor());

transcriberContract('FakeTranscriber', () => new FakeTranscriber());

catalogContract('FakeProviderCatalog', () => new FakeProviderCatalog());

describe('FakeProgressSink', () => {
  it('records emitted events in order', () => {
    const sink = new FakeProgressSink();
    sink.emit({ type: 'started', target: 'x' });
    sink.emit({ type: 'completed', target: 'x' });
    expect(sink.events).toEqual([
      { type: 'started', target: 'x' },
      { type: 'completed', target: 'x' },
    ]);
  });
});

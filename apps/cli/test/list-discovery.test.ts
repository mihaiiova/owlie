import { describe, expect, it } from 'vitest';
import type { CollectionAdapter, ContentCollection, ContentItem } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

const FEED_URL = 'https://example.com/feed.xml';
const PAGE_URL = 'https://example.com/';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

function makeItem(): ContentItem {
  return {
    id: 'rss:entry:post-1',
    sourceType: 'rss',
    canonicalUrl: 'https://example.com/1',
    title: 'First post',
    metadata: { entryId: 'post-1', feedUrl: FEED_URL },
  };
}

function discoverCollection(url: string): ContentCollection {
  return { id: `rss:feed:${url}`, sourceType: 'rss', canonicalUrl: url, metadata: { format: 'rss' } };
}

function makeAdapter(discovered: ContentCollection[] | undefined) {
  const calls: { discoverUrl?: string; listUrl?: string } = {};
  const adapter: CollectionAdapter & {
    discover?(locator: { url: string }): Promise<ContentCollection[]>;
  } = {
    id: 'rss',
    sourceType: 'rss',
    recognize: (locator) => locator.url === FEED_URL,
    async resolve(locator) {
      return {
        id: `rss:feed:${locator.url}`,
        sourceType: 'rss',
        canonicalUrl: locator.url,
        title: 'Example Channel',
        metadata: { format: 'rss' },
      };
    },
    async list(collection, _options) {
      calls.listUrl = collection.canonicalUrl;
      return { collection, items: [makeItem()], truncated: false };
    },
  };
  if (discovered !== undefined) {
    adapter.discover = async (locator) => {
      calls.discoverUrl = locator.url;
      return discovered;
    };
  }
  return { adapter, calls };
}

function deps(adapter: CollectionAdapter): CliDeps {
  return { list: { adapter } };
}

describe('list — feed discovery', () => {
  it('lists a discovered feed from a supplied page URL', async () => {
    const { adapter, calls } = makeAdapter([discoverCollection(FEED_URL)]);
    const { io, stdout } = capture();
    const code = await run(['list', PAGE_URL, '--json'], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    expect(calls.discoverUrl).toBe(PAGE_URL);
    expect(calls.listUrl).toBe(FEED_URL);
    const envelope = JSON.parse(stdout()).result;
    expect(envelope.collection).toMatchObject({
      id: 'rss:feed:https://example.com/feed.xml',
      sourceType: 'rss',
      canonicalUrl: FEED_URL,
    });
    expect(envelope.items).toEqual([
      expect.objectContaining({ id: 'rss:entry:post-1', title: 'First post' }),
    ]);
    // list is metadata-only: no document/extraction field is emitted.
    expect(envelope.items[0]).not.toHaveProperty('document');
  });

  it('uses a direct recognized feed URL unchanged without discovery', async () => {
    const { adapter, calls } = makeAdapter([discoverCollection(FEED_URL)]);
    const { io } = capture();
    const code = await run(['list', FEED_URL, '--json'], io, deps(adapter));
    expect(code).toBe(ExitCode.Success);
    expect(calls.discoverUrl).toBeUndefined();
    expect(calls.listUrl).toBe(FEED_URL);
  });

  it('fails with a clear discovery error when no feed is discoverable', async () => {
    const { adapter } = makeAdapter([]);
    const { io, stdout, stderr } = capture();
    const code = await run(['list', PAGE_URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('no RSS/Atom feed discoverable');
  });

  it('fails with a clear discovery error when the adapter cannot discover', async () => {
    const { adapter } = makeAdapter(undefined);
    const { io, stdout, stderr } = capture();
    const code = await run(['list', PAGE_URL], io, deps(adapter));
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('no RSS/Atom feed discoverable');
  });
});

import { describe, expect, it } from 'vitest';
import { HackerNewsAdapter } from '@owlieio/adapter-hackernews';

/**
 * Live Hacker News test against the official API. Requires
 * `OWLIE_LIVE_TESTS=1` and network access; skipped in the default suite. Item
 * 8863 ("My YC app: Dropbox") is old, so its discussion no longer changes.
 */
const liveEnabled = process.env.OWLIE_LIVE_TESTS === '1';

describe.skipIf(!liveEnabled)('hacker news live', () => {
  it('lists the front page', async () => {
    const adapter = new HackerNewsAdapter();
    const collection = await adapter.resolve({ url: 'https://news.ycombinator.com/' });
    const result = await adapter.list(collection, { limit: 3 });
    expect(result.items).toHaveLength(3);
    for (const item of result.items) {
      expect(item.id).toMatch(/^hackernews:item:\d+$/);
      expect(item.title).toBeTruthy();
    }
  }, 60_000);

  it('extracts a known old discussion', async () => {
    const adapter = new HackerNewsAdapter();
    const item = await adapter.resolveItem({ url: 'https://news.ycombinator.com/item?id=8863' });
    const document = await adapter.extract(item);
    expect(document.title).toBe('My YC app: Dropbox - Throw away your USB drive');
    expect(document.author).toBe('dhouston');
    expect(document.text).toContain('[BrandonM]');
    expect(document.metadata.commentsIncluded).toBeGreaterThan(10);
  }, 120_000);
});

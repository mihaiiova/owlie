import { describe, expect, it } from 'vitest';
import { RssAdapter } from '@owlieio/adapter-rss';
import { DefaultHttpFetcher } from '@owlieio/core';
import { parseAppleShowUrl, resolveAppleShowFeed } from '@owlieio/adapter-podcast';

/**
 * Live Apple Podcasts show resolution. Requires `OWLIE_LIVE_TESTS=1` and
 * network access to Apple's lookup API and the show's feed host. Skipped in
 * the default suite. The default show (Unexplainable) has a public feed;
 * override with `OWLIE_LIVE_APPLE_SHOW_URL`.
 */
const liveEnabled = process.env.OWLIE_LIVE_TESTS === '1';
const showUrl =
  process.env.OWLIE_LIVE_APPLE_SHOW_URL ??
  'https://podcasts.apple.com/us/podcast/unexplainable/id1554578197';

describe.skipIf(!liveEnabled)('apple podcasts show live resolution', () => {
  it("resolves the show's feed and lists its entries", async () => {
    const reference = parseAppleShowUrl(showUrl);
    expect(reference).toBeDefined();
    const fetcher = new DefaultHttpFetcher();
    const show = await resolveAppleShowFeed(reference!, { fetcher });
    expect(show.feedUrl).toMatch(/^https?:\/\//);

    const adapter = new RssAdapter({ fetcher });
    const collection = await adapter.resolve({ url: show.feedUrl, hint: 'feed' });
    const result = await adapter.list(collection, { limit: 3 });
    expect(result.items.length).toBeGreaterThan(0);
  }, 120_000);
});

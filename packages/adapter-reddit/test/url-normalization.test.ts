import { describe, expect, it } from 'vitest';
import { normalizeSubredditUrl } from '@owlieio/adapter-reddit';

describe('subreddit URL normalization', () => {
  it.each([
    'https://reddit.com/r/LocalLLaMA',
    'https://www.reddit.com/r/LocalLLaMA/',
    'https://old.reddit.com/r/LocalLLaMA',
    'https://new.reddit.com/r/LocalLLaMA',
    'https://www.reddit.com/r/LocalLLaMA/new/',
    'https://www.reddit.com/r/LocalLLaMA/.rss',
    'https://www.reddit.com/r/LocalLLaMA/hot/.rss',
    'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=week',
  ])('normalizes %s to a stable identity', (url) => {
    const locator = normalizeSubredditUrl(url);
    expect(locator).not.toBeNull();
    expect(locator?.subreddit).toBe('localllama');
    expect(locator?.collectionId).toBe('reddit:subreddit:localllama');
    expect(locator?.canonicalUrl).toBe('https://www.reddit.com/r/localllama/');
  });

  it('lowercases the subreddit in the identity', () => {
    const locator = normalizeSubredditUrl('https://www.reddit.com/r/LocalLLaMA');
    expect(locator?.collectionId).toBe('reddit:subreddit:localllama');
  });

  it('rejects non-subreddit URLs', () => {
    expect(normalizeSubredditUrl('https://example.com/r/LocalLLaMA')).toBeNull();
    expect(normalizeSubredditUrl('https://www.reddit.com/user/someone')).toBeNull();
    expect(normalizeSubredditUrl('https://www.reddit.com/r/foo/comments/abc123/title')).toBeNull();
    expect(normalizeSubredditUrl('not a url')).toBeNull();
    expect(normalizeSubredditUrl('ftp://reddit.com/r/foo')).toBeNull();
  });

  it('rejects invalid subreddit names', () => {
    expect(normalizeSubredditUrl('https://www.reddit.com/r/')).toBeNull();
    expect(normalizeSubredditUrl('https://www.reddit.com/r/bad-name/')).toBeNull();
  });
});

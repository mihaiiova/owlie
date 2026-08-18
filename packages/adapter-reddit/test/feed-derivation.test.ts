import { describe, expect, it } from 'vitest';
import { deriveSubredditFeedUrl } from '@owlieio/adapter-reddit';

describe('subreddit feed derivation', () => {
  it('derives the default "new" feed', () => {
    expect(deriveSubredditFeedUrl('LocalLLaMA')).toBe(
      'https://www.reddit.com/r/localllama/new/.rss',
    );
  });

  it('derives hot, top, and rising feeds', () => {
    expect(deriveSubredditFeedUrl('LocalLLaMA', 'hot')).toBe(
      'https://www.reddit.com/r/localllama/hot/.rss',
    );
    expect(deriveSubredditFeedUrl('LocalLLaMA', 'top', 'week')).toBe(
      'https://www.reddit.com/r/localllama/top/.rss?t=week',
    );
    expect(deriveSubredditFeedUrl('LocalLLaMA', 'rising')).toBe(
      'https://www.reddit.com/r/localllama/rising/.rss',
    );
  });

  it('defaults the top period to week', () => {
    expect(deriveSubredditFeedUrl('LocalLLaMA', 'top')).toBe(
      'https://www.reddit.com/r/localllama/top/.rss?t=week',
    );
  });

  it('honors an explicit top period', () => {
    expect(deriveSubredditFeedUrl('LocalLLaMA', 'top', 'month')).toBe(
      'https://www.reddit.com/r/localllama/top/.rss?t=month',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { parseSubredditFeed, RedditAdapter } from '@owlieio/adapter-reddit';

describe('RedditAdapter recognition and resolution', () => {
  it('recognizes subreddit URLs', () => {
    const adapter = new RedditAdapter();
    expect(adapter.recognize({ url: 'https://www.reddit.com/r/LocalLLaMA' })).toBe(true);
    expect(adapter.recognize({ url: 'https://example.com/r/LocalLLaMA' })).toBe(false);
  });

  it('resolves a canonical collection with a stable identity', async () => {
    const adapter = new RedditAdapter();
    const collection = await adapter.resolve({ url: 'https://old.reddit.com/r/LocalLLaMA/new/' });
    expect(collection.id).toBe('reddit:subreddit:localllama');
    expect(collection.canonicalUrl).toBe('https://www.reddit.com/r/localllama/');
    expect(collection.metadata.subreddit).toBe('localllama');
  });
});

describe('parseSubredditFeed reuse', () => {
  it('delegates to the RSS adapter parser', async () => {
    const feed = await parseSubredditFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>r/LocalLLaMA</title></feed>',
    );
    expect(feed.format).toBe('atom');
    expect(feed.title).toBe('r/LocalLLaMA');
  });
});

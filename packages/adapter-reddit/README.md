# @owlieio/adapter-reddit

Reddit subreddit source adapter for Owlie CLI.

Reddit is a first-class source type but uses **RSS/Atom transport only**: a
subreddit URL is converted to a public Reddit Atom feed. No OAuth, no
credentials, no comment-tree extraction, and no HTML scraping.

## What is implemented (pure, no network)

- `normalizeSubredditUrl` — recognizes and normalizes subreddit URLs across
  `reddit.com`, `www`, `old`, and `new` hosts.
- `subredditCollectionId` — stable identity `reddit:subreddit:<name>`.
- `deriveSubredditFeedUrl` — derives `new`/`hot`/`top`/`rising` Atom feed URLs.
- `RedditAdapter` — implements `CollectionAdapter`; recognition and resolution
  are pure, `list` throws `NotImplementedError`.

## Feed reuse

`parseSubredditFeed` delegates to `@owlieio/adapter-rss`'s `parseFeed`. Reddit
URL normalization, identity construction, and feed derivation stay here.

## v1 boundary

Default sort is `new`. Reddit's `.rss` endpoints return Atom XML, so parser
selection is content-aware (see `detectFeedFormat` in `@owlieio/adapter-rss`).

## Dependency rules

May depend on `@owlieio/core` and, by documented exception,
`@owlieio/adapter-rss`. No providers, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```

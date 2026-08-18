# @owlieio/adapter-rss

RSS/Atom source adapter for Owlie CLI.

This scaffold implements pure feed detection and URL normalization, defines the
parsed-feed vocabulary, and stubs the parser. Real parsing and network fetching
land with extraction work. No network calls are made.

## What is implemented

- `detectFeedFormat` — content-aware detection of Atom vs RSS by root element,
  **not** by file extension (important because Reddit's `.rss` endpoints return
  Atom XML).
- `normalizeFeedUrl` / `isFeedUrl` — pure URL helpers.
- `ParsedFeed` / `ParsedEntry` — provider-neutral parsed-feed types.
- `parseFeed` — declared, throws `NotImplementedError` until a safe parser is
  added.
- `RssAdapter` — implements `CollectionAdapter` and `ContentExtractor`;
  recognition and resolution are pure.

## v1 boundary

For RSS v1, only content supplied by the feed is used. Owlie does not follow
external links from RSS entries.

## Dependency rules

May depend only on `@owlieio/core`. The Reddit adapter may reuse this package's
parsing functionality (documented exception).

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```

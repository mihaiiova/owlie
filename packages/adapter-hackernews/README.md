# @owlieio/adapter-hackernews

Hacker News source adapter for Owlie CLI (ADR 0038). Internal package, bundled
into `owlie`; never published.

It reads the official Hacker News API (`https://hacker-news.firebaseio.com/v0`,
no key) through the injected `HttpFetcher`, so the extraction proxy, SSRF
rules, deadlines and byte budgets apply.

## What it does

- `parseHackerNewsUrl` — pure recognition of `news.ycombinator.com` list pages
  (`/`, `/news`, `/newest`, `/best`, `/ask`, `/show`), user submissions
  (`/submitted?id=USER`) and items (`/item?id=N`). `/rss` is not claimed.
- `HackerNewsAdapter` — a `CollectionAdapter` and `ItemAdapter`:
  - `list` returns stories in HN's order with `hnId`, `kind`, `score`,
    `commentCount` and `linkUrl`, skipping deleted, dead and comment items and
    capping item fetches at three per requested story;
  - `extract` returns a discussion document: the post and a comment tree
    bounded by top-level comments, reply depth and total comments;
  - `fetchStory` returns the post without its comments.
- `hackerNewsHtmlToText` — converts HN's limited HTML to plain text.

Reading the linked article (`--hn-content article|both`) is composed in
`apps/cli` with the article adapter; this package depends only on
`@owlieio/core`.

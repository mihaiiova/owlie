# ADR 0035 — Classify page URLs as articles before feed discovery

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

ADR 0033 made every remaining safe HTTP(S) URL in `owlie extract` a
feed-discovery candidate, and stated that a page URL is never reinterpreted as
an article. Most article pages belong to sites that expose a feed, so
`owlie extract <article URL>` returned a batch of the site's recent entries
instead of the requested article, and only `owlie process URL` reached the
article adapter. For a general-purpose web content extractor (ADR 0034),
"article URL in, article out" is the basic case.

## Decision

- After YouTube and podcast recognition declines, `extract` classifies the page
  from **one** fetch, reusing the response the generic episode-page resolver
  already fetched when it deferred. The article adapter owns classification
  (`ArticleAdapter.classify`); the CLI only routes on the result.
- A page is an article when:
  - it declares `og:type` `article`, or a JSON-LD `@type` of `Article`,
    `NewsArticle`, `BlogPosting`, `Report`, `ScholarlyArticle`, or
    `TechArticle` (including `@graph` and `@type` arrays), and yields readable
    text; or
  - it declares no `og:type` and its readable text is at least
    `MIN_READABLE_ARTICLE_CHARS` (500) characters.
- A page whose `og:type` declares another type (such as `website`) is not
  classified by its readable body, because homepages and listing pages often
  have long readable text.
- An article page is written as a single `NormalizedDocument`. Any other page
  goes to ADR 0033 feed discovery using the same response
  (`discoverFromResponse`); ranking and probes are unchanged. A page that is
  neither fails with one error naming both paths.
- `--article` and `--feed` force either path with no fallback. They exclude each
  other and the podcast resolver flags; `--article` with a YouTube or direct
  feed URL is a usage error.
- `ARTICLE_FALLBACK` now marks only article text taken from a page that was not
  classified as an article (the `process URL` and linked-item fallback). A page
  classified as an article carries no warning, including after an episode-page
  deferral.
- This refines ADR 0033: discovery now runs only for non-article pages.

## Consequences

- `owlie extract <article URL>` returns that article. Scripts that passed an
  article URL to `extract` to get its site's feed batch must now pass `--feed`
  or the feed URL.
- Consumers can call `owlie extract URL --article` when they already know a URL
  is an article, making the result independent of page declarations.
- Classification is heuristic. A site with an undeclared short article gets
  feed discovery; `--article` covers that case.
- Linked feed entries classified as articles no longer carry `ARTICLE_FALLBACK`.

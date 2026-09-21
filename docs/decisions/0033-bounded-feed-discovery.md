# ADR 0033 — Bounded one-hop RSS/Atom feed discovery from supplied pages

- **Status:** Accepted
- **Date:** 2026-09-22

## Context

ADRs 0012, 0013, and 0014 restricted the collection-capable commands
(`owlie list`, the feed batch path of `owlie extract`, and `owlie process
--each`) to direct, feed-shaped URLs. Publications commonly expose their RSS or
Atom feed only from a supplied HTML page, so users had to locate and copy the
feed URL manually.

## Decision

- Add a bounded, one-hop RSS/Atom feed-discovery capability behind the RSS
  adapter's existing safe `HttpFetcher`/`HttpFetchPolicy` seam. Discovery
  fetches only the supplied page, accepts only declared `text/html` or
  `application/xhtml+xml`, and reads eligible `<link rel="alternate">` elements
  with a constrained non-DOM tokenizer. It neither executes JavaScript nor
  follows links recursively.
- If eligible declared candidates exist, they are resolved against the final
  fetched page URL, canonicalized, deduplicated, capped at eight, and ranked
  deterministically (RSS before Atom, document order within a format). If no
  declared candidate exists, discovery probes at most six same-origin
  conventional paths in this fixed order: `/feed`, `/rss`, `/feed.xml`,
  `/rss.xml`, `/atom.xml`, `/index.xml`. A probe is a candidate only when its
  fetch passes the existing RSS adapter media-type gate and feed parser.
- `RssAdapter.recognize()` stays pure and network-free. `RssAdapter` gains a
  `discover` operation (via a focused `FeedDiscoveryService`) using its
  injected fetcher and policy, returning a deterministically ranked list of
  feed collections. The reserved `CollectionDiscovery` contract is not reused
  because its `discover(locator)` shape cannot forward cancellation/options.
- Direct feed-shaped URLs keep their exact existing command path and output.
  Discovery runs only when direct recognition fails in the three
  collection-capable command modes:
  - `owlie list URL` discovers a feed, then lists entry metadata only.
  - `owlie extract URL` discovers a feed, then runs the existing bounded
    linked-item batch (single JSON envelope). A page URL with no discoverable
    feed is a clear discovery error; it is **not** silently reinterpreted as an
    article.
  - `owlie process URL --each` discovers a feed, then runs the existing
    sequential JSONL batch. A page URL with no discoverable feed remains a
    usage/collection-mode failure.
- Plain `owlie process URL --prompt ...` remains single-URL item processing and
  never discovers a feed or silently becomes a batch.
- The top-level `extract` item dispatch no longer falls back to the article
  adapter for a remaining safe HTTP(S) URL; that role is replaced by feed
  discovery. Static-article extraction remains available through the universal
  dispatch used by `owlie process URL` and linked-item feed extraction.
- RSS and Atom are the only supported formats. JSON Feed is excluded because
  the adapter has no JSON Feed parser.

## Consequences

This narrowly supersedes the direct-feed-URL limitation in ADRs 0012, 0013,
and 0014. Feed discovery is bounded and one-hop, so it is not generic
crawling, search, podcast-directory discovery, or browser rendering. No new
`owlie feeds` command is introduced, and the existing output formats, batch
limits, and linked-item extraction strategy are unchanged.

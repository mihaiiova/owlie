# ADR 0013 — Universal `extract` dispatch and bounded feed batch extraction

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

`owlie extract` was hardwired to `YouTubeAdapter`, so it could extract only
YouTube transcripts. The static-article adapter (ADR 0011) and the RSS/Atom
adapter (ADRs 0009, 0010, 0012) existed but had no CLI path for linked
content: a direct article URL could not be extracted, and a feed's linked
items could not be turned into documents through the CLI.

## Decision

- `extract` becomes the single universal extraction verb. A direct URL is
  dispatched through an ordered item-adapter registry: specialized adapters
  first (YouTube), then the article adapter for any remaining safe HTTP(S) URL.
  Dispatch is deterministic and pure — a `recognize` check only; no network.
- A recognized RSS/Atom feed URL instead enters a bounded linked-item batch
  extraction. The feed is listed through `RssAdapter` (bounded, default 10,
  maximum 500), then each linked item URL is dispatched through the same
  registry (YouTube or article only; feeds are not recursively traversed, and
  the feed's embedded text is not silently substituted for linked-page
  extraction).
- The batch writes a single JSON envelope regardless of `--json`:
  `{ collection, items: [{ url, title, document } | { url, title, error }], truncated }`.
  It carries on after per-item extraction errors, records a structured
  `{ code, message, stage: 'extraction' }` error, and exits 1 if any item
  failed. Diagnostics and progress remain on stderr so the envelope is never
  corrupted.
- `--limit` is shared with `owlie list` via the same `parseCollectionLimit`
  rule (default 10, maximum 500, positive decimal integer).

## Consequences

Direct YouTube and article extraction share one command and one output shape
(plain text by default, a JSON `NormalizedDocument` with `--json`). Feed
extraction gains a self-contained, stream-safe JSON envelope for downstream
consumers. The CLI registry now registers three functional adapters (YouTube,
RSS, article). LLM processing of feed items (`process --each`), JSONL feed
extraction, recursive feed traversal, parallel extraction, and browser
rendering remain out of scope.

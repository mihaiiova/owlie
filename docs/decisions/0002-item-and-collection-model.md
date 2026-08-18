# ADR 0002 — Item and collection domain model

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

Sources come in two shapes: collections (YouTube playlist, subreddit, RSS/Atom
feed) and items (YouTube video, podcast episode, Reddit post, RSS/Atom entry).
Conflating them would make listing, extraction, and identity unstable.

## Decision

Model collections and items as distinct types with stable identities.

- `ContentCollection` — `id`, `sourceType`, `canonicalUrl`, metadata.
- `ContentItem` — `id`, `sourceType`, `canonicalUrl`, optional
  title/description/publishedAt/author, metadata.
- `NormalizedDocument` — the extraction output, with a `mediaType`
  (`text` | `transcript` | `mixed`) so documents are not assumed to be
  transcripts.

Adapters split into `CollectionAdapter` (recognize → resolve → list bounded
items) and `ItemAdapter` (recognize/resolveItem → extract), with a distinct
`resolveItem` name so one adapter (for example YouTube) can implement both.

## Consequences

- Stable, provider-neutral identities enable correlation and deduplication.
- Reddit and RSS documents are written text; YouTube/podcast documents may be
  transcripts — each flows through the same `NormalizedDocument` shape.
- Collection operations must be bounded (default limit 10, hard maximum),
  never unbounded.

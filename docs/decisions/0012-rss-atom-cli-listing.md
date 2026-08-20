# ADR 0012 — Bounded RSS/Atom listing in the CLI (`owlie list`)

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

ADR 0005 scoped v0.1 to YouTube extraction and DeepSeek processing and
explicitly deferred all collection commands, including `list`. The
`@owlieio/adapter-rss` package later gained safe, bounded `list`/`extract`
(ADRs 0009 and 0010), but no CLI command exposed it. The linked-content epic
(issue #23) requires bounded RSS/Atom listing to be user-visible.

## Decision

- Add `owlie list FEED_URL [--limit N] [--json]` as the first functional
  collection command.
- The CLI owns only argument parsing, result writing, progress/diagnostics, and
  exit-code translation; all content behavior delegates to `RssAdapter` through
  the existing core `listCollection` orchestration.
- `--limit` is parsed as a positive decimal integer and passed through core's
  `resolveLimit` (default 10, maximum 500); invalid or oversized values fail
  with a clear error.
- `--json` writes a single envelope of collection metadata, HTML-free item
  summaries, and `truncated`. The human-readable form is a stable,
  line-oriented summary that never emits raw entry HTML or secrets.
- `RssAdapter` is registered as a functional collection adapter, so `owlie
doctor` and `--help` reflect RSS/Atom listing. Collection search, per-entry
  RSS extraction, and other deferred sources remain unexposed.

## Consequences

This supersedes ADR 0005's "Collections stay unimplemented" clause only for
bounded RSS/Atom listing. Sorting/search, linked-page extraction, direct item
extraction, batch processing, and podcast/Reddit listing remain deferred.

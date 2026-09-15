# ADR 0021 — Media-type and output-format vocabulary in `@owlieio/core`

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Content-type classification and the output-format vocabulary were scattered
across packages. `isHtmlContentType` was duplicated in `adapter-podcast` and
`adapter-article`; `adapter-podcast` also defined `isJsonContentType` and
`isFeedContentType`; `adapter-rss` defined `isFeedMediaType`; and `apps/cli`
setup defined `isJsonMediaType`. Each re-implemented "split on `;`, lowercase,
match" with subtly different semantics — RSS accepted a missing declaration
while podcast rejected it, despite ADRs 0010 and 0016 locating safe-HTTP policy
in core.

`HttpFetcher.fetchText` returned a bare string and discarded the declared
`contentType`, the exact anti-pattern the safe-fetch consolidation removed, yet
it remained a required interface method. Separately, `OutputFormat` (which
includes the streaming `jsonl` form) coexisted with `ProcessResult.format`'s
inline `'text' | 'markdown' | 'json'` union, and the unused
`OUTPUT_FORMATS`/`isOutputFormat` runtime surface had no production callers.

## Decision

- Add `packages/core/src/media-type.ts` exporting `mediaTypeOf` and the pure
  `isHtmlContentType`/`isJsonContentType`/`isFeedContentType` predicates. Every
  predicate returns `false` for a missing or empty declaration.
- Adapters and the CLI import these from core and delete their local copies.
  RSS keeps its documented accept-missing compatibility at its own gate
  (`assertFeedMediaType`), which rejects only a declared incompatible type.
- Remove `fetchText` from `HttpFetcher` and `DefaultHttpFetcher`; `fetch` and
  the optional `fetchToFile` remain the fetch surface.
- Make `ProcessResult.format` use a named `ProcessResultFormat` type distinct
  from the reserved serializer's `OutputFormat`, and remove
  `OUTPUT_FORMATS`/`isOutputFormat`.

## Consequences

- One shared, well-named media-type classifier in core replaces five local
  copies; missing-vs-incompatible behavior is decided per call site.
- `HttpFetcher` no longer advertises a method that silently drops the content
  type, and test fakes implement only the real fetch surface.
- The single-result `ProcessResultFormat` and the reserved streaming
  `OutputFormat` vocabularies are distinct. `jsonl` remains a
  streaming/serialization format, never a single-result format.
- No runtime behavior, command output, or exit codes change.

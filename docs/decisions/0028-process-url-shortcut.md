# ADR 0028 — Single-URL processing shortcut (`owlie process URL`)

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

[ADR 0014](0014-process-feed-batches.md) decided that ordinary `owlie process`
input was exactly one local file, `--input`, or stdin, and never fetched a URL.
Users wanted a direct `owlie process URL --prompt "..."` shortcut: extract a
single article, YouTube video, or podcast episode and process it in one command,
instead of piping `owlie extract URL` into `owlie process`.

## Decision

- `owlie process URL --prompt "..."` accepts a positional http(s) URL in
  single-input mode. The URL is extracted first through the universal
  YouTube/podcast/article dispatch (ADR 0013), then the resulting document is
  processed with the selected provider, exactly as a piped document would be.
- Feed URLs are not handled here: `owlie process FEED_URL --each` remains the
  collection mode, and a feed URL in single-input mode is a usage error that
  points to `--each`.
- Provider/model/API-key resolution happens before any network work, so a
  misconfigured invocation fails fast rather than after an expensive extraction
  or transcription.
- Ambiguous combinations (`URL + --input`, `URL + piped stdin`) are usage
  errors, matching the existing single-input contract.

## Consequences

- `owlie process URL` supersedes ADR 0014's "ordinary process never fetches a
  URL" decision for single-item URLs; feed batches and local/stdin input are
  unchanged.
- `--input-format json` applies only to local/stdin input, not to URL
  extraction (the extracted document is already normalized).

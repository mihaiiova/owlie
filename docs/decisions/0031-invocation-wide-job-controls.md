# ADR 0031 — Invocation-wide job controls

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

`owlie-app` runs one `owlie` command per hosted job and needs consistent
cancellation, availability, and resource-bounding semantics across every
networked command path. Before this change, `--timeout-ms` and
`--max-media-bytes` applied only to direct podcast-media extraction, and
SIGINT/SIGTERM mapped to the same exit code as an ordinary failure, so a worker
could not distinguish a cancellable job from a retryable one.

## Decision

- A job is exactly one CLI invocation. The `--timeout-ms` deadline becomes
  invocation-wide and composes with the injected SIGINT/SIGTERM signal across
  listing, safe HTTP requests, extraction/transcription, feed batches, and
  provider calls. Feed batches share the single deadline; no later item or
  provider request starts after it expires.
- `--max-network-bytes` bounds total network download bytes through the existing
  core `HttpFetchPolicy`/`DefaultHttpFetcher` seams (feeds, articles, episode
  pages, Apple lookups) and the direct-media streaming path. `--max-media-bytes`
  remains a direct-media-specific override.
- `--max-stdout-bytes` bounds total stdout bytes before a response crosses the
  app-facing protocol boundary. Exceeding it is an `OUTPUT_LIMIT_EXCEEDED`
  error (exit 1), not a cancellation.
- SIGINT/SIGTERM and deadline expiry abort all participating work, clean
  temporary artifacts, emit a final structured cancellation record
  (`kind: "cancelled"` in `--json` mode), and exit 130. Other failures retain
  their documented error/usage exit codes.
- The CLI does not attempt portable CPU/memory enforcement; container/deployment
  policy owns that limit. Retry policy stays in `owlie-app`, outside the CLI.
- Existing SSRF checks, redirect validation, temp cleanup, secret redaction, and
  the no-network default test suite are preserved.

## Consequences

- Hosted workers classify a job that exited 130 as non-retryable cancellation
  and bound per-job network/output exposure without a child process enforcing
  CPU/memory quotas.
- Cancellation is a distinct exit-code class, which is a small breaking change
  for consumers that previously treated exit 1 as the only failure path.
- Non-JSON human output is unchanged except that cancellation now exits 130.

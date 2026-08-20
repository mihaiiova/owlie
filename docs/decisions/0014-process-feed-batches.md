# ADR 0014 — Bounded feed processing with `process --each` (JSONL)

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

`owlie process` accepted exactly one local file, `--input`, or stdin document
and never fetched a URL. Users needed to process a bounded RSS/Atom feed's
linked articles and YouTube videos with a single prompt, retaining both the
fetched document and the LLM result per item. Universal `extract` (ADR 0013)
already provided the linked-item extraction dispatch; processing built on it.

## Decision

- Add a collection-processing mode reserved for feeds:
  `owlie process FEED_URL --each --limit N --prompt ...`. Ordinary `process`
  input (one file, `--input`, or stdin) is unchanged, and `--each` is rejected
  for non-collection inputs and for ambiguous combinations (`--input`, piped
  stdin) with a usage error.
- The feed is listed through `RssAdapter` (bounded, default 10, maximum 500),
  then each linked item is dispatched through the same universal
  specialized-then-article rule and processed sequentially in feed order.
  Cancellation is honored before each new item.
- Each attempted entry emits exactly one JSONL record on stdout: success
  `{ item: { url, title }, document, result }`, or failure
  `{ item: { url, title }, error: { code, message, stage } }` where `stage` is
  `extraction` or `processing`. Diagnostics and progress stay on stderr.
- Recoverable per-item failures are recorded and the batch continues; exit code
  is 0 only when every attempted item succeeds and 1 when any record is an
  error. Configuration/usage errors before work begins keep their existing
  non-success mapping.
- The shared linked-item extraction seam (`extractLinkedItem`) is extracted so
  `extract` and `process` reuse one dispatch rule rather than duplicating it.

## Consequences

`process --each` gives feed content a stream-safe, self-contained JSONL
contract distinct from `extract`'s single feed envelope, so downstream
consumers can act on partial results as they stream. Parallelism/concurrency
controls, persistent retries/jobs, `--each` for non-feed collections,
recursive feeds, and browser rendering remain out of scope.

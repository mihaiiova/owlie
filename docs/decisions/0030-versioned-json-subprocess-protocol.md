# ADR 0030 — Versioned JSON subprocess protocol

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

`owlie-app` runs the published `owlie` command as a subprocess and must parse
its output. Before this change, `--json` output was fragmented: only some
command results carried a `schemaVersion`, single-command errors were
human-readable stderr text, and progress was rendered only through a spinner.
A consumer therefore needed command-specific heuristics to parse success,
incremental progress, errors, and cancellation.

## Decision

- `--json` becomes a unified, versioned machine protocol. A successful
  single-result command writes one stdout envelope
  `{ schemaVersion, command, result }`. Streaming commands (`process --each`)
  write command-defined stdout JSONL records, each carrying the same
  `schemaVersion` and `command` identity.
- stderr is versioned JSONL in `--json` mode. It carries the serialized
  existing `ProgressEvent` values (as `{ schemaVersion, command, kind:
"progress", event }`) and terminal records for failures
  (`{ schemaVersion, command, kind: "error", code, message }`) and cancellation
  (`{ schemaVersion, command, kind: "cancelled", message }`). Human diagnostics
  continue only outside `--json` mode.
- The protocol begins at schema version 1 and evolves independently from
  package SemVer: additive fields are compatible within a package major;
  incompatible changes increment `schemaVersion`.
- stdout stays reserved for result data; stderr never carries result data.
- `@owlieio/core` owns the provider-neutral protocol types (envelope, progress,
  error, cancellation) and the `JSON_PROTOCOL_SCHEMA_VERSION` constant.
  `apps/cli` owns argument parsing, serialization, redaction, stdout/stderr
  transport, and exit-code translation.
- Command-specific results stay nested under `result`, including feed-batch and
  `process --each` streaming semantics. `NormalizedDocument.schemaVersion`
  remains the content-model version alongside the outer protocol version.
- The initial consumer-facing error taxonomy reuses the `OwlieError` code
  hierarchy, plus `USAGE_ERROR` for inline usage failures that are not
  represented by a thrown error. It is closed and documented (see
  [cli-contract](../../cli-contract.md)).
- Diagnostics are redacted before transport: secrets, URL userinfo, query
  strings, and fragments are never serialized.
- `process --input-format json` accepts either a raw `NormalizedDocument` or a
  protocol envelope whose `result` is a document, so
  `owlie extract --json | owlie process --input-format json` keeps working.

## Consequences

- `owlie-app` parses every successful `--json` command through one envelope and
  reads progress/errors/cancellation from versioned JSONL on stderr without
  corrupting stdout result parsing.
- This is a breaking change to `--json` output and is released accordingly.
- Non-JSON human-oriented output is unchanged.
- A consumer must tolerate additive fields at the current schema version and
  switch parsers when `schemaVersion` increments.

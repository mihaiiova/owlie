---
'owlie': major
---

Make `--json` a unified, versioned machine protocol: successful single-result
commands write `{ schemaVersion, command, result }` to stdout, streaming
commands (`process --each`) write versioned JSONL records, and stderr carries
versioned JSONL progress and terminal error/cancellation records (ADR 0030).
`NormalizedDocument.schemaVersion` is retained as the content-model version, and
`process --input-format json` accepts either a raw document or a protocol
envelope so `extract --json | process` keeps working.

# Output formats

Output formats:

```text
text
markdown
json
jsonl
```

`OutputSerializer` (see [core contracts](core-contracts.md)) remains a reserved
provider-neutral interface with no v0.1 implementation; the CLI writes these
formats directly.

## Conventions

- `text` and `markdown` are human-oriented.
- `json` is a single structured document.
- `jsonl` is one JSON object per line. In v0.1 it is used by
  `owlie process FEED_URL --each` to stream one record per attempted feed
  item; other commands do not emit JSONL.

## v0.1

- `extract` writes raw transcript text by default, or a JSON
  `NormalizedDocument` with `--json`.
- `process` writes `text`/`markdown` by default, or JSON with `--json`; it
  accepts a JSON `NormalizedDocument` on stdin via `--input-format json`.
- `process FEED_URL --each` streams JSONL to stdout, one record per attempted
  item.
- Results go to stdout; diagnostics and progress go to stderr.

## Files and cache

Temporary downloads and intermediate artifacts will eventually use
platform-appropriate cache directories. v0.1 writes no state into the
repository or current working directory unless explicitly requested, and
implements no persistent history or job records.

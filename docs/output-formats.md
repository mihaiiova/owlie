# Output formats

Reserved output formats:

```text
text
markdown
json
jsonl
```

## Conventions

- `text` and `markdown` are human-oriented.
- `json` is a single structured document.
- `jsonl` is reserved for future collection streaming (one JSON object per
  line); it is not used in v0.1.

## v0.1

- `extract` writes raw transcript text by default, or a JSON
  `NormalizedDocument` with `--json`.
- `process` writes `text`/`markdown` by default, or JSON with `--json`; it
  accepts a JSON `NormalizedDocument` on stdin via `--input-format json`.
- Results go to stdout; diagnostics and progress go to stderr.

## Files and cache

Temporary downloads and intermediate artifacts will eventually use
platform-appropriate cache directories. v0.1 writes no state into the
repository or current working directory unless explicitly requested, and
implements no persistent history or job records.

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
- `jsonl` is the natural streaming format for collection results (one JSON
  object per line).

## Explicit destinations

Normal results go to stdout unless the user chooses a file or directory:

```bash
owlie extract URL --output-file document.md
owlie process URL --output json
owlie process COLLECTION_URL --each --limit 10 --output-dir ./results
```

## Files and cache

Temporary downloads and intermediate artifacts will eventually use
platform-appropriate cache directories. V1 writes no state into the repository
or current working directory unless explicitly requested, and implements no
persistent history or job records.

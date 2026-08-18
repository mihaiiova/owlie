# CLI contract

The `owlie` executable is the only entry point that translates failures into
exit codes.

## Commands

```text
owlie list     List items in a collection         (planned)
owlie extract  Extract normalized text from an item (planned)
owlie search   Search collection-provided fields   (planned)
owlie process  Process documents with an LLM       (planned)
owlie config   View and edit configuration         (planned)
owlie doctor   Report local environment health
owlie help     Show help
```

Only `--help`, `--version`, and `doctor` are functional. Planned commands print
a concise "not implemented yet" message and exit non-zero; they never pretend
to process content.

## Streams

- **stdout** carries results (documents, search results, JSON output).
- **stderr** carries diagnostics and progress.
- JSON output is never mixed with progress text.

## Conventions

- `--quiet` / `-q` suppress diagnostics on stderr.
- `--json` emits machine-readable JSON on stdout.
- `--env-file PATH` loads an explicit environment file (reserved).
- Commands support cancellation signals; libraries never call `process.exit`.
- Secrets are never printed.

## Exit codes

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | General error   |
| 2    | Usage error     |
| 3    | Not implemented |

## `owlie doctor`

Reports Node version, OS and architecture, ffmpeg/ffprobe/Python availability,
presence (never values) of supported provider environment variables, and
whether the configuration and cache directories are writable.

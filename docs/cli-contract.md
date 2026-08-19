# CLI contract

The `owlie` executable is the only entry point that translates failures into
exit codes.

## Commands

```text
owlie extract  Extract a transcript from a YouTube video   (v0.1)
owlie process  Process text or a document with DeepSeek    (v0.1)
owlie setup    Configure provider, model, and API key       (v0.1)
owlie doctor   Report local environment health             (functional)
owlie help     Show help
```

The commands above are the only ones `owlie` recognizes. Deferred commands
(`list`, `search`, `config`) are not exposed: they report an "unknown command"
usage error (code 2) rather than pretending to process content.

## Streams

- **stdout** carries the requested result only (raw text, or a single JSON
  document with `--json`).
- **stderr** carries diagnostics and progress.
- JSON output is never mixed with progress text.

## v0.1 command surface

```text
owlie extract URL [--json] [--language LANG]
owlie process [FILE] --prompt "..." [--input FILE] [--input-format text|json] [--model MODEL] [--json]
```

- `extract` reads a single YouTube video URL and writes the transcript text,
  or a JSON `NormalizedDocument` with `--json`. `--language LANG` sets a
  comma-separated language priority list (default `en`).
- `process` reads exactly one input — a positional file, `--input FILE`, or
  stdin — and rejects ambiguous multiple inputs (exit code 2). Empty piped
  stdin is a clear error (exit code 1). `process` never fetches a URL: a URL
  argument is treated as literal text or rejected, never fetched.
- `process` requires a model selection via `--model` (or `DEEPSEEK_MODEL`).
  v0.1 supports `deepseek-chat` (default) and `deepseek-reasoner`; a missing or
  unsupported model is a clear configuration error (exit code 1).

## Conventions

- `--quiet` / `-q` suppress diagnostics on stderr.
- `--json` emits machine-readable JSON on stdout.
- `--env-file PATH` loads an explicit environment file (reserved).
- Commands support cancellation signals; libraries never call `process.exit`.
- Broken pipes (`EPIPE`) terminate quietly (exit 0) rather than dumping a stack
  trace.
- Secrets are never printed.

## Exit codes

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | General error   |
| 2    | Usage error     |
| 3    | Not implemented |

## `owlie doctor`

Reports Node version, OS and architecture, `DEEPSEEK_API_KEY` presence
(never its value), the functional adapter (YouTube) and provider (DeepSeek).
It also checks whether the configuration and cache directories are writable.

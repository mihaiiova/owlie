# CLI contract

The `owlie` executable is the only entry point that translates failures into
exit codes.

## Commands

```text
owlie extract  Extract a YouTube video, an article, or a feed's linked items   (v0.1)
owlie list     List entries in an RSS/Atom feed            (functional)
owlie process  Process text, a document, or a feed's linked items with DeepSeek or OpenAI   (v0.1)
owlie setup    Configure provider, model, and API key       (v0.1)
owlie doctor   Report local environment health             (functional)
owlie help     Show help
```

The commands above are the only ones `owlie` recognizes. Deferred commands
(`search`, `config`) are not exposed: they report an "unknown command" usage
error (code 2) rather than pretending to process content.

## Streams

- **stdout** carries the requested result only (raw text, a single JSON
  document with `--json`, or one JSONL record per attempted item with
  `process --each`).
- **stderr** carries diagnostics and progress.
- JSON output is never mixed with progress text.

## v0.1 command surface

```text
owlie extract URL [--json] [--language LANG] [--limit N]
owlie list FEED_URL [--limit N] [--json]
owlie process [FILE] --prompt "..." [--provider NAME] [--input FILE] [--input-format text|json] [--model MODEL] [--json]
owlie process FEED_URL --each [--limit N] --prompt "..." [--provider NAME]
```

- `extract` dispatches a direct URL through the registry: YouTube video URLs
  to the YouTube adapter, then any other safe HTTP(S) URL to the article
  adapter. It writes the transcript/article text, or a JSON
  `NormalizedDocument` with `--json`. `--language LANG` sets a comma-separated
  language priority list for YouTube transcripts (default `en`).
- `extract` on an RSS/Atom feed URL performs a bounded linked-item batch
  extraction and always writes a single JSON envelope (regardless of `--json`)
  with `{ collection, items: [{ url, title, document } | { url, title, error }], truncated }`.
  It carries on after per-item extraction errors and exits 1 if any item
  failed. `--limit N` bounds the batch (default 10, maximum 500); invalid or
  oversized limits fail with a clear error.
- `list` resolves an RSS/Atom feed URL and writes a bounded, line-oriented
  summary of its entries to stdout, or a single JSON envelope with `--json`
  (collection metadata, item metadata, and `truncated`). `--limit N` bounds the
  listing (default 10, maximum 500); invalid or oversized limits fail with a
  clear error. Raw entry HTML is never written to stdout.
- `process` reads exactly one input — a positional file, `--input FILE`, or
  stdin — and rejects ambiguous multiple inputs (exit code 2). Empty piped
  stdin is a clear error (exit code 1). `process` never fetches a URL: a URL
  argument is treated as literal text or rejected, never fetched.
- `process FEED_URL --each` is the collection-processing mode. It resolves the
  feed, then lists, extracts (through the same universal dispatch), and
  processes each bounded linked item sequentially in feed order, streaming one
  JSONL record per attempted entry to stdout. Success records carry
  `{ item: { url, title }, document, result }`; failures carry
  `{ item: { url, title }, error: { code, message, stage } }` where `stage` is
  `extraction` or `processing`. It retains successful items, exits 1 if any
  record is an error, and `--limit N` bounds the batch (default 10, maximum
  500). `--each` rejects `--input`, piped stdin, and non-feed URLs as usage
  errors (exit code 2).
- `process` selects a provider via `--provider`, then `OWLIE_PROVIDER`, then
  the saved active provider, and a model within that provider via `--model`
  (or `DEEPSEEK_MODEL`/`OPENAI_MODEL`). DeepSeek documents `deepseek-chat` as a
  default; OpenAI has no default model. A missing or unknown provider, missing
  key, or missing model is a clear configuration error (exit code 1). A model
  id never implies a provider.

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

Reports Node version, OS and architecture, non-secret per-provider API key and
model presence for each functional provider (DeepSeek, OpenAI), the functional
adapters (YouTube, RSS, article), and whether the configuration and cache
directories are writable.

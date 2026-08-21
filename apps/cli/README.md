# owlie

Local-first content extraction and processing, as a command-line tool.

## Status

v0.1 is functional: `extract` (YouTube transcripts, static articles, and
bounded RSS/Atom feed batches), `list` (bounded feed entries), `process`
(DeepSeek; single document or `--each` feed batches), `setup`, `doctor`,
`--help`, and `--version`.

## Commands

```text
owlie extract URL   # YouTube video, static article, or bounded RSS/Atom feed
owlie list FEED_URL # list bounded entries of an RSS/Atom feed
owlie process ...   # process text or a document with an LLM
owlie setup         # configure provider, model, and API key interactively
owlie doctor        # report local environment health
owlie help          # show help
```

Run `owlie --help` or `owlie <command> --help` for full usage.

## Pipe-first contract

- Results go to stdout; diagnostics and progress go to stderr.
- `extract` writes normalized text for a direct URL (`--json` for the
  `NormalizedDocument`) or a single JSON envelope for a feed URL.
- `list` writes a line-oriented summary, or a JSON envelope with `--json`.
- `process` writes plain text (`--json` for the `ProcessResult`) in
  single-input mode; `--each` streams one JSONL record per feed item.
- `--quiet` suppresses progress output.
- Secrets are never printed. No telemetry.

## Configuration

Set `DEEPSEEK_API_KEY` (or run `owlie setup`) to use `owlie process`.
Configuration is persisted to `~/.config/owlie/config.json`.

## License

Apache-2.0. See the `LICENSE` file in this package.

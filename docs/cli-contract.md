# CLI contract

The `owlie` executable is the only entry point that translates failures into
exit codes.

## Commands

```text
owlie extract  Extract a YouTube video, an article, or a feed's linked items   (v0.1)
owlie resolve  Resolve a URL to its validated audio media URL (no transcription)  (v0.1)
owlie list     List entries in an RSS/Atom feed            (functional)
owlie process  Process text, a document, or a feed's linked items with DeepSeek or OpenAI   (v0.1)
owlie models   List current models for your LLM providers     (v0.1)
owlie auth     Manage API keys for LLM providers             (v0.1)
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
owlie extract URL [--podcast-media | --podcast-page | --podcast-apple] [--json] [--language LANG] [--limit N] [--timeout-ms N] [--max-media-bytes N]
owlie resolve URL [--podcast-media | --podcast-page | --podcast-apple] [--json]
owlie list FEED_URL [--limit N] [--json]
owlie process [FILE] --prompt "..." [--model provider/model-id] [--input FILE] [--input-format text|json] [--json]
owlie process FEED_URL --each [--limit N] --prompt "..." [--model provider/model-id]
owlie models [--provider <provider>] [--refresh] [--json]
owlie auth add <provider> | list | remove <provider>
```

- `extract` dispatches a direct URL through the registry: YouTube video URLs
  to the YouTube adapter; podcast direct-audio URLs, Apple Podcasts episode
  URLs, and safe server-rendered episode pages with declarative audio metadata
  to the podcast adapter; then any remaining safe HTTP(S) URL to the article
  adapter. Apple episodes resolve through Apple's public lookup API, with a
  matching RSS enclosure fallback. Other episode pages use JSON-LD, declared
  oEmbed, `<audio>`/`<source>`, or RSS/Atom enclosure signals;
  they never execute JavaScript, and a safe episode-page URL with no
  discoverable audio defers to the article adapter with a stderr diagnostic.
  It writes transcript/article text, or a JSON
  `NormalizedDocument` with `--json`. `--language LANG` sets a comma-separated
  language priority list for YouTube transcripts (default `en`). Podcast
  transcription requires local Python with faster-whisper, ffmpeg, and ffprobe.
  A resolver-selection flag (`--podcast-media`, `--podcast-page`,
  `--podcast-apple`) asserts which podcast resolver finds the audio URL; at
  most one may be supplied, it overrides URL recognition, and a URL the selected
  resolver does not recognize is a usage error (exit code 2) rather than a
  fallback to another resolver or the article adapter. `--timeout-ms N` and
  `--max-media-bytes N` are positive integers for direct podcast-media
  extraction: the former creates one deadline shared by audio resolution,
  download, ffprobe, ffmpeg, and local faster-whisper; the latter bounds the
  binary download, retaining its safe default when omitted. Cancellation or the
  deadline terminates the active local command and cleans temporary media and
  transcription artifacts. Long media is transcribed in bounded five-minute
  chunks (two-second overlap) with monotonic progress.
- `extract` on an RSS/Atom feed URL performs a bounded linked-item batch
  extraction and always writes a single JSON envelope (regardless of `--json`)
  with `{ collection, items: [{ url, title, document } | { url, title, error }], truncated }`.
  It carries on after per-item extraction errors and exits 1 if any item
  failed. `--limit N` bounds the batch (default 10, maximum 500); invalid or
  oversized limits fail with a clear error.
- `resolve` resolves a URL to a validated audio media URL without downloading
  or transcribing it. It accepts exactly one URL and zero or one
  resolver-selection flag. With no flag, podcast resolvers run in recognition
  order; it never dispatches to article extraction. It writes the media URL
  plus a newline to stdout, or a stable JSON envelope with `--json`:
  `{ schemaVersion: 1, resolver, mediaUrl, metadata }`. A flag the URL does not
  match is a usage error (exit code 2); resolution failures (no enclosure,
  unsafe media URL, incompatible content type) are general errors (exit code 1).
- `list` resolves an RSS/Atom feed URL and writes a bounded, line-oriented
  summary of its entries to stdout, or a single JSON envelope with `--json`
  (collection metadata, item metadata, and `truncated`). `--limit N` bounds the
  listing (default 10, maximum 500); invalid or oversized limits fail with a
  clear error. Raw entry HTML is never written to stdout.
- `process` reads exactly one input — a positional http(s) URL, a positional
  file, `--input FILE`, or stdin — and rejects ambiguous multiple inputs
  (exit code 2). A URL is extracted first through the universal
  YouTube/podcast/article dispatch and then processed; a feed URL in
  single-input mode is rejected with guidance to use `--each`. Empty piped
  stdin is a clear error (exit code 1).
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
- `process` selects a provider and model via `--model`. A compound
  `--model provider/model-id` is self-contained; a plain `--model model-id`
  resolves the provider from the deprecated `--provider` alias, then
  `OWLIE_PROVIDER`, then the saved active provider, and the model via `--model`
  (or `DEEPSEEK_MODEL`/`OPENAI_MODEL`). A `--provider` that disagrees with a
  compound `--model` provider is a usage error. DeepSeek documents
  `deepseek-chat` as a default; OpenAI has no default model. A missing or
  unknown provider, missing key, or missing model is a clear configuration
  error (exit code 1). Model ids are discovered at runtime from the provider,
  never validated against an Owlie-side allowlist.
- `models` lists a provider's current models from its live listing endpoint
  through the `ProviderCatalog` contract. With `--provider`, it lists one
  provider (plain model ids); without it, it lists all configured providers
  (as `provider/model-id`). Results are cached for one hour; `--refresh`
  re-queries, and a failed fetch falls back to a cached list with a diagnostic
  or fails clearly when there is no cache.
- `auth add <provider>` prompts for and stores an API key in the user config;
  `auth list` reports each provider's effective credential source
  (`environment` vs `stored`, never the key); `auth remove <provider>` deletes
  a stored key. Environment variables override stored keys.

## Conventions

- `--quiet` / `-q` suppress diagnostics on stderr.
- `--json` emits machine-readable JSON on stdout.
- `--env-file PATH` loads an explicit environment file (functional).
- `--hosted` enables deterministic hosted mode (see below).
- Commands support cancellation signals; libraries never call `process.exit`.
- Broken pipes (`EPIPE`) terminate quietly (exit 0) rather than dumping a stack
  trace.
- Secrets are never printed.

## Hosted mode

`--hosted` is a single strict switch available to every command. It makes one
invocation deterministic for a hosted subprocess: configuration comes from
command-line flags and injected process environment only. It disables implicit
`.env`/`.env.local` loading, `--env-file` (rejected as a usage error when
combined), the saved user configuration, and model-cache fallback
(`owlie models` always live-fetches and never reads or writes the cache).
`owlie auth` and `owlie setup` are rejected as a usage error (exit code 2)
before any prompt or state write. Non-hosted behavior and precedence are
unchanged.

## Exit codes

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | General error   |
| 2    | Usage error     |
| 3    | Not implemented |

## `owlie doctor`

Reports Node version, OS and architecture, and per-provider readiness for each
functional provider (DeepSeek, OpenAI): the API key presence (`set`/`not set`,
never the value), its credential source (`environment` vs `stored`), and the
effective model id (for example `deepseek-chat`), or `null` when no model is
configured. Key/model resolution matches `owlie process` precedence — process
environment → `--env-file` → `.env.local` → `.env` → saved profile. It also
lists the functional adapters (YouTube, podcast, RSS, article), local
transcription readiness (Python + faster-whisper, ffmpeg, ffprobe, and the
configured Whisper model), and whether the configuration and cache directories
are writable. The JSON report includes `configurationSource`
(`"hosted" | "local"`); in hosted mode it resolves provider readiness from
flags and process environment only.

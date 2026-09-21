# CLI contract

The `owlie` executable is the only entry point that translates failures into
exit codes.

## Commands

```text
owlie extract  Extract a YouTube video, an article, or a feed's linked items   (v0.1)
owlie resolve  Resolve a URL to its validated audio media URL (no transcription)  (v0.1)
owlie list     List entries in an RSS/Atom feed (direct URL or discovered page) (functional)
owlie process  Process text, a document, or a feed's linked items with DeepSeek or OpenAI   (v0.1)
owlie models   List current models for your LLM providers     (v0.1)
owlie auth     Manage API keys for LLM providers             (v0.1)
owlie setup    Configure provider, model, and API key       (v0.1)
owlie doctor   Report local environment health             (functional)
owlie capabilities  Report the artifact, schema, and catalog manifest   (functional)
owlie help     Show help
```

The commands above are the only ones `owlie` recognizes. Deferred commands
(`search`, `config`) are not exposed: they report an "unknown command" usage
error (code 2) rather than pretending to process content.

## Streams

- **stdout** carries the requested result only: raw text, or with `--json` a
  single versioned envelope `{ schemaVersion, command, result }` (or
  command-defined JSONL records for streaming commands, each carrying
  `schemaVersion` and `command`).
- **stderr** carries diagnostics and progress. In `--json` mode stderr is
  versioned JSONL: `{ schemaVersion, command, kind: "progress", event }`
  progress records and terminal `kind: "error"`/`kind: "cancelled"` records.
  Human diagnostics continue only outside `--json` mode.
- JSON output is never mixed with progress text.

## JSON subprocess protocol

`--json` is a unified, versioned machine protocol (ADR 0030). Every successful
single-result command writes `{ schemaVersion, command, result }` to stdout,
where `schemaVersion` is `1` and `result` holds the command-specific payload.
Streaming commands (`process --each`) write one JSONL record per item, each
with `schemaVersion` and `command` plus the command's record fields.

The closed consumer-facing error taxonomy on stderr terminal records is:

| Code                    | Exit | Meaning                                        |
| ----------------------- | ---- | ---------------------------------------------- |
| `USAGE_ERROR`           | 2    | Invalid arguments or flags                     |
| `VALIDATION_ERROR`      | 2    | Invalid input shape (thrown `ValidationError`) |
| `CONFIGURATION_ERROR`   | 1    | Missing/conflicting configuration              |
| `EXTRACTION_ERROR`      | 1    | Content extraction failed                      |
| `CAPTIONS_UNAVAILABLE`  | 1    | Requested captions are unavailable             |
| `TRANSCRIPTION_ERROR`   | 1    | Local transcription failed                     |
| `PROCESSING_ERROR`      | 1    | LLM processing failed                          |
| `NOT_IMPLEMENTED`       | 3    | Not implemented                                |
| `OWLIE_ERROR`           | 1    | General failure (fallback)                     |
| `OUTPUT_LIMIT_EXCEEDED` | 1    | Command wrote more stdout than its byte budget |

Cancellation emits `kind: "cancelled"` instead of `kind: "error"` and exits
**130** (SIGINT/SIGTERM or an expired invocation deadline). All stderr records
redact secrets, URL userinfo, query strings, and fragments.

## v0.1 command surface

```text
owlie extract URL [--podcast-media | --podcast-page | --podcast-apple] [--json] [--language LANG] [--limit N] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N] [--max-media-bytes N]
owlie resolve URL [--podcast-media | --podcast-page | --podcast-apple] [--json] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]
owlie list FEED_URL [--limit N] [--json] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]
owlie process [FILE] --prompt "..." [--model provider/model-id] [--input FILE] [--input-format text|json] [--json] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]
owlie process FEED_URL --each [--limit N] --prompt "..." [--model provider/model-id] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]
owlie models [--provider <provider>] [--refresh] [--json] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]
owlie setup [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]
owlie auth add <provider> | list | remove <provider>
owlie capabilities [--json]
```

- `extract` dispatches a direct URL through the registry: YouTube video URLs
  to the YouTube adapter; podcast direct-audio URLs, Apple Podcasts episode
  URLs, and safe server-rendered episode pages with declarative audio metadata
  to the podcast adapter. A remaining safe HTTP(S) URL is then a feed-discovery
  candidate: the command fetches the supplied page (HTML/XHTML only), reads
  eligible `<link rel="alternate">` elements, and otherwise probes the six
  fixed same-origin conventional paths, then runs the bounded linked-item
  batch on the top-ranked discovered feed. A page URL with no discoverable
  feed is a clear error (it is not reinterpreted as an article). Apple episodes
  resolve through Apple's public lookup API, with a matching RSS enclosure
  fallback. Other episode pages use JSON-LD, declared oEmbed,
  `<audio>`/`<source>`, or RSS/Atom enclosure signals; they never execute
  JavaScript, and a safe episode-page URL with no discoverable audio is treated
  as a feed-discovery candidate rather than article text.
  It writes transcript text, or a feed batch JSON envelope for a feed/page
  URL, or a JSON `NormalizedDocument` with `--json` for a direct item.
  `--language LANG` sets a comma-separated language priority list for YouTube
  transcripts (default `en`). Podcast
  transcription requires local Python with faster-whisper, ffmpeg, and ffprobe.
  A resolver-selection flag (`--podcast-media`, `--podcast-page`,
  `--podcast-apple`) asserts which podcast resolver finds the audio URL; at
  most one may be supplied, it overrides URL recognition, and a URL the selected
  resolver does not recognize is a usage error (exit code 2) rather than a
  fallback to another resolver or the article adapter. The invocation-wide
  `--timeout-ms N`, `--max-network-bytes N`, and `--max-stdout-bytes N` budgets
  are positive integers and apply as described below. `--max-media-bytes N`
  remains a direct-podcast-media override that bounds the binary download while
  retaining its safe default when omitted. Cancellation or the deadline
  terminates the active local command and cleans temporary media and
  transcription artifacts. Long media is transcribed in bounded five-minute
  chunks (two-second overlap) with monotonic progress.
- `extract` on an RSS/Atom feed URL — or an HTML page URL that exposes one —
  performs a bounded linked-item batch
  extraction and always writes a single versioned JSON envelope (regardless of
  `--json`) whose `result` is
  `{ collection, items: [{ url, title, document } | { url, title, error }], truncated }`.
  It carries on after per-item extraction errors and exits 1 if any item
  failed. `--limit N` bounds the batch (default 10, maximum 500); invalid or
  oversized limits fail with a clear error.
- `resolve` resolves a URL to a validated audio media URL without downloading
  or transcribing it. It accepts exactly one URL and zero or one
  resolver-selection flag. With no flag, podcast resolvers run in recognition
  order; it never dispatches to article extraction. It writes the media URL
  plus a newline to stdout, or a stable versioned JSON envelope with `--json`
  whose `result` is `{ resolver, mediaUrl, metadata }`. A flag the URL does not
  match is a usage error (exit code 2); resolution failures (no enclosure,
  unsafe media URL, incompatible content type) are general errors (exit code 1).
- `list` resolves an RSS/Atom feed URL (or discovers one from a supplied HTML
  page URL) and writes a bounded, line-oriented
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
  feed (or discovers one from a supplied HTML page URL), then lists, extracts
  (through the same universal dispatch), and
  processes each bounded linked item sequentially in feed order, streaming one
  JSONL record per attempted entry to stdout. Every record carries
  `schemaVersion` and `command: "process"`. Success records add
  `{ item: { url, title }, document, result }`; failures add
  `{ item: { url, title }, error: { code, message, stage } }` where `stage` is
  `extraction` or `processing`. It retains successful items, exits 1 if any
  record is an error, and `--limit N` bounds the batch (default 10, maximum
  500). `--each` rejects `--input`, piped stdin, and URLs with no discoverable
  feed as usage errors (exit code 2).
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
- `capabilities` is a non-network, non-secret startup manifest command. With
  `--json` it writes a versioned envelope whose `result` is
  `{ version, protocolSchemaVersion, documentSchemaVersion, commands,
adapters, providers, resolvers }`; plain output is concise human-readable
  text. `owlie --version --json` writes the versioned envelope
  `{ schemaVersion: 1, command: "version", result: <version> }` while plain
  `owlie --version` output is unchanged.

## Conventions

- `--quiet` / `-q` suppress diagnostics on stderr.
- `--json` emits the versioned JSON subprocess protocol on stdout (see above).
- `--env-file PATH` loads an explicit environment file (functional).
- `--hosted` enables deterministic hosted mode (see below).
- Commands support cancellation signals; libraries never call `process.exit`.
- Broken pipes (`EPIPE`) terminate quietly (exit 0) rather than dumping a stack
  trace.
- Secrets are never printed.

## Invocation-wide job controls

Every networked command (`extract`, `resolve`, `list`, `process`, `models`,
`setup`) accepts three invocation-wide budgets plus the existing bounded
collection limits:

- `--timeout-ms N` is one positive-integer deadline for the complete
  invocation. It composes with the injected SIGINT/SIGTERM signal and bounds
  listing, safe HTTP requests, extraction/transcription, feed batches, and
  provider calls. Feed batches share the single deadline; no later item or
  provider request starts after it expires. Expiry aborts participating work,
  cleans temporary artifacts, and exits 130 with a `kind: "cancelled"` record.
- `--max-network-bytes N` caps total network download bytes through the core
  `HttpFetchPolicy`/`DefaultHttpFetcher` seams (feeds, articles, episode
  pages, Apple lookups) and the direct-media streaming path. `--max-media-bytes`
  remains a direct-media-specific override.
- `--max-stdout-bytes N` caps total stdout bytes before a response crosses the
  app-facing protocol boundary. Exceeding it is an `OUTPUT_LIMIT_EXCEEDED`
  error (exit 1), not a cancellation.

All three flags are positive integers and reject invalid values as usage errors
(exit 2). CPU and memory remain container-runtime controls; the CLI does not
attempt portable enforcement.

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
| 130  | Cancelled       |

Cancellation (`CancelledError`, SIGINT/SIGTERM, or an expired invocation
`--timeout-ms` deadline) is a distinct, non-retryable outcome with a versioned
`kind: "cancelled"` terminal record in `--json` mode.

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

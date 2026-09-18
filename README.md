# Owlie CLI

[![codecov](https://codecov.io/gh/mihaiiova/owlie-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/mihaiiova/owlie-cli)

Local-first content extraction and processing, as a command-line tool.

Owlie CLI turns sources like YouTube videos, podcast episodes, Reddit posts, and
RSS/Atom entries into normalized text that can be searched, transcribed, and
processed with an LLM — entirely on your machine.

> **Status: functional core (v0.1 milestone complete).** The v0.1 milestone is
> shipped (latest release v0.4.0) and covers: `owlie extract` (YouTube
> transcripts, local podcast transcription, static articles, and bounded feed
> batches), `owlie resolve` (validated audio media URLs), `owlie list` and
> `owlie process --each` (RSS/Atom feeds), and `owlie process` (text,
> documents, or URLs with DeepSeek or OpenAI). The repository compiles, lints,
> and tests cleanly. See [Product scope](docs/product-scope.md) for what works
> and what does not.

## Quick start

```bash
# Extract a transcript from an individual YouTube video (pure-JS, no Python)
owlie extract "https://www.youtube.com/watch?v=..."

# Transcribe podcast audio locally (faster-whisper) from a direct media URL,
# an Apple Podcasts episode URL, or a declarative server-rendered episode page
owlie extract "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"

# Extract the readable text of a static article
owlie extract "https://example.com/story"

# List or batch-extract the bounded items of an RSS/Atom feed
owlie list "https://example.com/feed.xml" --limit 20

# Process text, a document, or a URL with DeepSeek or OpenAI
owlie extract "https://www.youtube.com/watch?v=..." |
  owlie process --prompt "Summarize this"
```

See [ADR 0005](docs/decisions/0005-v0-1-scope.md) for the full v0.1 scope and
non-goals.

## Examples

Every command writes its result to **stdout** and diagnostics/progress to
**stderr**, so commands compose over Unix pipes. JSON output (`--json`) is never
mixed with progress text. In `--json` mode every successful single-result command
writes one versioned envelope `{ schemaVersion, command, result }`; streaming
commands (`process --each`) write versioned JSONL records. stderr carries
versioned JSONL progress and terminal error/cancellation records (ADR 0030).

### Extract

```bash
# YouTube transcript (pure-JS, no Python; --language is a priority list)
owlie extract "https://www.youtube.com/watch?v=..."
owlie extract "https://www.youtube.com/watch?v=..." --language en,es
owlie extract "https://www.youtube.com/watch?v=..." --json   # JSON NormalizedDocument

# Static article text
owlie extract "https://example.com/story"

# Podcast audio (requires local Python + faster-whisper, ffmpeg, ffprobe,
# and a pre-provisioned Whisper model). A direct-media invocation can bound
# the whole operation and the download size.
owlie extract "https://cdn.example.com/episode.mp3" --timeout-ms 900000 --max-media-bytes 536870912
owlie extract "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"
owlie extract "https://publisher.example/episodes/my-episode"

# Authoritative resolver selection (no fallback; at most one flag)
owlie extract "https://podcasts.apple.com/us/podcast/example/id12345?i=67890" --podcast-apple

# Bounded linked-item extraction from an RSS/Atom feed (one JSON envelope)
owlie extract "https://example.com/feed.xml" --limit 20
```

### Resolve

```bash
# Print the validated audio media URL without downloading or transcribing
owlie resolve "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"
owlie resolve "https://publisher.example/episodes/my-episode" --podcast-page --json
```

### List

```bash
owlie list "https://example.com/feed.xml" --limit 20
owlie list "https://example.com/feed.xml" --json   # collection + item metadata + truncated
```

### Process

```bash
# Pipe an extracted transcript into the LLM
owlie extract "https://www.youtube.com/watch?v=..." | owlie process --prompt "Summarize this"

# Process a file, or declare the input with --input
owlie process transcript.txt --prompt "Summarize this"
owlie process --input transcript.txt --prompt "Summarize this"

# Process a normalized JSON document (e.g. a previous extract --json)
owlie extract "https://www.youtube.com/watch?v=..." --json |
  owlie process --input-format json --prompt "Extract the key claims"

# Process a URL directly (extracted through the universal dispatch first);
# a feed URL is rejected here — use --each instead
owlie process "https://example.com/article" --prompt "Summarize this"

# Select provider and model explicitly (self-contained)
owlie process transcript.txt --prompt "Summarize this" --model openai/gpt-4o-mini

# JSON result instead of text/markdown
owlie process transcript.txt --prompt "Summarize this" --json

# Process each linked item of a feed, streaming one JSONL record per item
owlie process "https://example.com/feed.xml" --each --limit 20 --prompt "Summarize this"
```

### Models

```bash
owlie models                          # all configured providers (provider/model-id)
owlie models --provider deepseek      # one provider (plain model ids)
owlie models --provider openai --refresh --json
```

### Auth

```bash
owlie auth add deepseek     # prompts for the key and stores it
owlie auth list             # shows the credential source, never the key
owlie auth remove openai
```

### Setup and doctor

```bash
owlie setup    # interactive: provider, model, API key, optional YouTube proxy, Whisper model
owlie doctor   # Node/platform, per-provider key+model, adapters, transcription readiness
owlie doctor --json
```

### Environment and quiet mode

```bash
# Load credentials from an explicit environment file
owlie process transcript.txt --prompt "Summarize this" --env-file ./credentials.env

# Suppress diagnostics on stderr
owlie extract "https://www.youtube.com/watch?v=..." --quiet
```

### Hosted mode

```bash
# Deterministic invocation for a hosted subprocess: flags and injected process
# environment only (no .env, saved profile, or model-cache fallback).
owlie --hosted process transcript.txt --prompt "Summarize this"
owlie --hosted doctor --json   # reports configurationSource: hosted
```

## Global options

| Option                                                   | Applies to                                  | Description                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--help`, `-h`                                           | all                                         | Show help (or help for a command)                                                                                         |
| `--version`, `-V`                                        | all                                         | Show version                                                                                                              |
| `--quiet`, `-q`                                          | all                                         | Suppress diagnostics on stderr                                                                                            |
| `--json`                                                 | all                                         | Emit the versioned JSON subprocess protocol on stdout (`{ schemaVersion, command, result }` envelope, or versioned JSONL) |
| `--env-file PATH`                                        | all                                         | Load an explicit environment file                                                                                         |
| `--hosted`                                               | all                                         | Deterministic mode: flags and process env only (no dotenv, saved profile, or model cache)                                 |
| `--model MODEL`                                          | `process`                                   | Select the model (`provider/model-id`, or `model-id`)                                                                     |
| `--refresh`                                              | `models`                                    | Bypass the model cache                                                                                                    |
| `--language LANG`                                        | `extract`                                   | Comma-separated transcript languages (default `en`)                                                                       |
| `--limit N`                                              | `list`, `extract` (feeds), `process --each` | Bound listing/extraction (default 10, max 500)                                                                            |
| `--timeout-ms N`                                         | all networked commands                      | One invocation-wide deadline across listing, HTTP, extraction/transcription, feeds, and providers                         |
| `--max-network-bytes N`                                  | all networked commands                      | Cap total network download bytes through the core fetch seam and direct media                                             |
| `--max-stdout-bytes N`                                   | all networked commands                      | Cap total stdout bytes before the protocol boundary                                                                       |
| `--max-media-bytes N`                                    | `extract` (direct media)                    | Cap the download size in bytes (direct-media override)                                                                    |
| `--each`                                                 | `process`                                   | Process each linked item of an RSS/Atom feed                                                                              |
| `--input FILE`                                           | `process`                                   | Read input from a file instead of a positional argument or stdin                                                          |
| `--input-format text\|json`                              | `process`                                   | Declare the input format (`text` default)                                                                                 |
| `--podcast-media` / `--podcast-page` / `--podcast-apple` | `extract`, `resolve`                        | Authoritative resolver selection (no fallback)                                                                            |

## Exit codes

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | General error   |
| 2    | Usage error     |
| 3    | Not implemented |
| 130  | Cancelled       |

## Planned sources

Individual items:

- YouTube video (v0.1)
- Static article (v0.1, via universal `extract`)
- Podcast direct-media URL, Apple Podcasts episode URL, or declarative server-rendered episode page (v0.1)
- Reddit post, discovered through a subreddit feed (deferred)
- RSS/Atom entry (bounded feed extraction via `owlie extract`)

Collections (deferred — not implemented in v0.1):

- YouTube playlist
- Subreddit (via Reddit's public Atom feeds)
- RSS/Atom feed (bounded `owlie list` and `owlie extract` are functional)

## Planned operations

- `extract` normalized text from an individual item (YouTube video or static
  article) or the bounded linked items of an RSS/Atom feed
- `process` a document with an LLM (v0.1: DeepSeek or OpenAI)
- `process` each item in a bounded RSS/Atom feed with an LLM, streaming one
  JSONL record per item
- `list` items in a collection (RSS/Atom feeds)
- `search` collection item titles, descriptions, and feed-provided content
  (deferred)
- `extract` a transcript from podcast media, an Apple Podcasts episode, or a declarative episode page via local Whisper (v0.1)
- `process` each item in other (non-feed) collections with an LLM (deferred)

Owlie CLI does **not** monitor sources or schedule recurring work.

## What currently works

```bash
owlie --help
owlie --version
owlie doctor [--json]
owlie extract URL   # YouTube video, podcast media/Apple episode/episode page, article, or bounded feed
owlie resolve URL   # print the validated audio media URL without transcribing
owlie list FEED_URL # list entries in an RSS/Atom feed
owlie process FILE|URL --prompt "..." [--model provider/model-id]  # DeepSeek or OpenAI
owlie process FEED_URL --each --prompt "..."  # stream one JSONL record per feed item
owlie models [--provider PROVIDER] [--refresh]  # list live models (cached, dynamic)
owlie auth add|list|remove PROVIDER  # manage API keys in the local store
owlie setup        # configure providers, models, and API keys
```

`--quiet`/`-q` suppresses diagnostics, `--json` emits machine-readable output,
and `--env-file PATH` loads an explicit environment file — all available on any
command. `--hosted` makes a single invocation deterministic (flags and process
environment only; it disables dotenv, saved configuration, and model-cache
fallback, and rejects `auth`/`setup`). `process` also accepts `--input FILE` and
`--input-format text|json`; `extract` and `resolve` accept the
`--podcast-media`/`--podcast-page`/`--podcast-apple` resolver-selection flags.

The remaining planned commands (`search`, `config`) are not exposed: they
report an "unknown command" usage error (exit code 2) rather than pretending
to work.

`owlie list` exposes the RSS adapter's bounded listing, and `owlie extract`
dispatches a direct URL to the YouTube, podcast, or article adapter — or, for a feed
URL, extracts its bounded linked items into one JSON envelope. `owlie resolve`
prints a validated audio media URL without transcribing it, with optional
`--podcast-media`/`--podcast-page`/`--podcast-apple` resolver selection. Remote text
fetches allow only globally routable destinations by default, canonically
classify IPv4/IPv6 addresses, reject URL userinfo, and omit URL query and
fragment data from diagnostics. For direct podcast media, `--timeout-ms` applies
one deadline across resolution, download, ffprobe, ffmpeg, and local Whisper;
`--max-media-bytes` caps the download (the existing safe HTTP cap remains the
default). Both values must be positive integers. `ffprobe` validates downloaded
media before transcoding, independently of weak or absent HTTP content types;
invalid media is rejected. The configured Whisper model must already be local,
because extraction never downloads model weights. Cancellation terminates active
local transcription commands and removes temporary downloads/intermediates.

Every networked command also accepts an invocation-wide `--timeout-ms` deadline
plus `--max-network-bytes` and `--max-stdout-bytes` budgets. Cancellation
(SIGINT/SIGTERM or an expired deadline) exits 130 with a versioned
`kind: "cancelled"` terminal record in `--json` mode, distinct from ordinary
errors.

## Non-goals

Owlie CLI does not provide:

- a web UI, authentication, billing, or credits
- source monitoring, schedules, or cron
- a local database or persistent job records
- Reddit OAuth, comment-tree extraction, or HTML scraping
- generic webpage crawling or browser-rendered extraction (the reusable
  `article` adapter is limited to directly supplied, server-rendered editorial
  HTML obtained through Owlie's safe HTTP fetcher)
- telemetry

Those responsibilities — where they exist at all — belong to the private,
hosted `owlie-app`.

## Relationship with `owlie-app`

`owlie-app` is the private hosted product. It owns the web UI, auth, billing,
Postgres, job queues, monitoring, notifications, storage, analytics, admin, and
deployment.

`owlie-cli` owns the reusable content functionality. `owlie-app` consumes it by
running the published `owlie` command as a subprocess (typically in a
container) — it does not import `owlie-cli` packages as libraries:

```text
owlie-app  →  runs `owlie` CLI (container/subprocess)
```

`owlie-cli` never imports from `owlie-app`. See
[docs/repository-boundaries.md](docs/repository-boundaries.md).

## Repository map

```text
apps/cli/                    The owlie executable
packages/core/               Provider-neutral contracts and types
packages/testing/            Fakes, fixtures, contract-test helpers
packages/adapter-youtube/    YouTube adapter (videos in v0.1)
packages/adapter-article/    Static server-rendered article adapter
packages/adapter-podcast/    Podcast media, Apple episode, and episode-page adapter
packages/adapter-rss/        RSS/Atom adapter (fetch, list, extract; `owlie list` exposes listing)
packages/adapter-reddit/     Reddit adapter (Atom transport only; scaffold)
packages/provider-deepseek/  DeepSeek content processor
packages/provider-openai/    OpenAI content processor
packages/provider-whisper/   Local faster-whisper transcriber
docs/                        Architecture, contracts, security, decisions
```

## Packages

| Package                      | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `@owlieio/core`              | Types, contracts, limits, safe HTTP policy/fetch, orchestration |
| `@owlieio/testing`           | Fakes, fixtures, contract-test helpers                          |
| `@owlieio/adapter-youtube`   | YouTube videos (playlists deferred)                             |
| `@owlieio/adapter-article`   | Safe static server-rendered editorial-page extraction           |
| `@owlieio/adapter-podcast`   | Podcast media, Apple episodes, and declarative episode pages    |
| `@owlieio/adapter-rss`       | RSS/Atom feeds and entries (fetch, list, extract)               |
| `@owlieio/adapter-reddit`    | Subreddits via public Atom feeds (scaffold)                     |
| `@owlieio/provider-deepseek` | DeepSeek `ContentProcessor`                                     |
| `@owlieio/provider-openai`   | OpenAI `ContentProcessor`                                       |
| `@owlieio/provider-whisper`  | Local faster-whisper `Transcriber`                              |
| `@owlieio/owlie`             | The `owlie` command-line interface (published)                  |

v0.1 adds `@owlieio/provider-deepseek` and makes `@owlieio/provider-openai`
functional, both implemented with `ai` (`@ai-sdk/deepseek` and
`@ai-sdk/openai`) behind the provider-neutral `ContentProcessor` contract.

Only `@owlieio/owlie` is published. The other `@owlieio/*` packages are internal
(private) — they organize the code and enforce dependency boundaries, and are
bundled into the `@owlieio/owlie` package at build time. They are never
published to npm; only the `@owlieio` scope is claimed for the published CLI.

## Development setup

Prerequisites: Node.js (pinned via `.nvmrc`; `engines` requires `>=20`), pnpm
(pinned via `packageManager`).

```bash
pnpm install
pnpm check        # format, lint, typecheck, test, build, exports, smoke
pnpm build        # build all packages
pnpm cli --help   # run the built CLI
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Further reading

- [Architecture](docs/architecture.md)
- [Product scope](docs/product-scope.md)
- [CLI contract](docs/cli-contract.md)
- [Output formats](docs/output-formats.md)
- [Configuration](docs/configuration.md)
- [Repository boundaries](docs/repository-boundaries.md)
- [Security model](docs/security-model.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE) (Apache-2.0)

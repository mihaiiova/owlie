# Owlie CLI

[![codecov](https://codecov.io/gh/mihaiiova/owlie-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/mihaiiova/owlie-cli)

Local-first content extraction and processing, as a command-line tool.

Owlie CLI turns sources like YouTube videos, podcast episodes, Reddit posts, and
RSS/Atom entries into normalized text that can be searched, transcribed, and
processed with an LLM — entirely on your machine.

> **Status: scaffold.** This repository is the foundation of the open-source
> core. It compiles, lints, and tests cleanly. The v0.1 milestone is the first
> functional slice: `owlie extract` (YouTube transcripts, articles, and feed
> batches) and `owlie process` (DeepSeek or OpenAI). See
> [Product scope](docs/product-scope.md) for what works and what does not.

## v0.1 (first functional milestone)

v0.1 delivers a small, pipeable CLI:

```bash
# Extract a transcript from an individual YouTube video
owlie extract "https://youtube.com/watch?v=..."

# Extract the readable text of a static article
owlie extract "https://example.com/story"

# Extract a bounded feed's linked items into one JSON envelope
owlie extract "https://example.com/feed.xml" --limit 20

# List entries in an RSS/Atom feed (bounded)
owlie list "https://example.com/feed.xml" --limit 20

# Process plain text or a normalized document with DeepSeek or OpenAI
owlie extract "https://youtube.com/watch?v=..." |
  owlie process --prompt "Summarize this"

owlie process transcript.txt --prompt "Summarize this" --provider openai
cat transcript.txt | owlie process --prompt "Summarize this"

# Process each linked item of a feed, streaming one JSONL record per item
owlie process "https://example.com/feed.xml" --each --prompt "Summarize this"
```

See [ADR 0005](docs/decisions/0005-v0-1-scope.md) for the full v0.1 scope and
non-goals.

## Planned sources

Individual items:

- YouTube video (v0.1)
- Static article (v0.1, via universal `extract`)
- Podcast episode (deferred)
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
- `extract` a transcript from audio or video via Whisper (deferred)
- `process` each item in other (non-feed) collections with an LLM (deferred)

Owlie CLI does **not** monitor sources or schedule recurring work.

## What currently works

```bash
owlie --help
owlie --version
owlie doctor
owlie extract URL   # YouTube video, article, or bounded feed (no external runtime dependencies)
owlie list FEED_URL # list entries in an RSS/Atom feed
owlie process FILE --prompt "..."   # DeepSeek (DEEPSEEK_API_KEY) or OpenAI (OPENAI_API_KEY)
owlie process FEED_URL --each --prompt "..."  # stream one JSONL record per feed item
owlie setup        # configure providers, models, and API keys
```

The remaining planned commands (`search`, `config`) are not exposed: they
report an "unknown command" usage error (exit code 2) rather than pretending
to work.

`owlie list` exposes the RSS adapter's bounded listing, and `owlie extract`
dispatches a direct URL to the YouTube or article adapter — or, for a feed
URL, extracts its bounded linked items into one JSON envelope. Remote text
fetches allow only globally routable destinations by default, canonically
classify IPv4/IPv6 addresses, reject URL userinfo, and omit URL query and
fragment data from diagnostics.

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
packages/adapter-podcast/    Podcast adapter (scaffold)
packages/adapter-rss/        RSS/Atom adapter (fetch, list, extract; `owlie list` exposes listing)
packages/adapter-reddit/     Reddit adapter (Atom transport only; scaffold)
packages/provider-openai/    OpenAI content processor
packages/provider-whisper/   Local faster-whisper transcriber (scaffold)
docs/                        Architecture, contracts, security, decisions
```

## Packages

| Package                     | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `@owlieio/core`             | Types, contracts, limits, safe HTTP policy/fetch, orchestration |
| `@owlieio/testing`          | Fakes, fixtures, contract-test helpers                          |
| `@owlieio/adapter-youtube`  | YouTube videos (playlists deferred)                             |
| `@owlieio/adapter-article`  | Safe static server-rendered editorial-page extraction           |
| `@owlieio/adapter-podcast`  | Podcast episodes (scaffold)                                     |
| `@owlieio/adapter-rss`      | RSS/Atom feeds and entries (fetch, list, extract)               |
| `@owlieio/adapter-reddit`   | Subreddits via public Atom feeds (scaffold)                     |
| `@owlieio/provider-openai`  | OpenAI `ContentProcessor`                                       |
| `@owlieio/provider-whisper` | Local faster-whisper `Transcriber` (scaffold)                   |
| `owlie`                     | The `owlie` command-line interface (published)                  |

v0.1 adds `@owlieio/provider-deepseek` and makes `@owlieio/provider-openai`
functional, both implemented with `ai` (`@ai-sdk/deepseek` and
`@ai-sdk/openai`) behind the provider-neutral `ContentProcessor` contract.

Only `owlie` is published. The `@owlieio/*` packages are internal (private) —
they organize the code and enforce dependency boundaries, and are bundled into
the `owlie` package at build time. They are never published to npm, so no npm
scope needs to be claimed.

## Development setup

Prerequisites: Node.js 20+ (pinned via `.nvmrc`), pnpm (pinned via
`packageManager`).

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
- [Repository boundaries](docs/repository-boundaries.md)
- [Security model](docs/security-model.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE) (Apache-2.0)

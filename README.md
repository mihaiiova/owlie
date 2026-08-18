# Owlie CLI

Local-first content extraction and processing, as a command-line tool.

Owlie CLI turns sources like YouTube videos, podcast episodes, Reddit posts, and
RSS/Atom entries into normalized text that can be searched, transcribed, and
processed with an LLM — entirely on your machine.

> **Status: scaffold.** This repository is the foundation of the open-source
> core. It compiles, lints, and tests cleanly, but it does **not** yet extract,
> search, transcribe, or process real content. See
> [Product scope](docs/product-scope.md) for what works and what does not.

## Planned sources

Individual items:

- YouTube video
- Podcast episode
- Reddit post (discovered through a subreddit feed)
- RSS/Atom entry

Collections:

- YouTube playlist
- Subreddit (via Reddit's public Atom feeds)
- RSS/Atom feed

## Planned operations

- `list` items in a collection
- `extract` normalized text from an individual item
- `extract` a transcript from audio or video
- `process` an extracted document with an LLM
- `search` collection item titles, descriptions, and feed-provided content
- optionally extract full item content before searching
- `process` each item in a bounded collection with an LLM

Owlie CLI does **not** monitor sources or schedule recurring work.

## What currently works

Only these commands are functional:

```bash
owlie --help
owlie --version
owlie doctor
```

The planned commands (`list`, `extract`, `search`, `process`, `config`) are
visible in help, return a concise "not implemented yet" message, and exit with a
non-zero code. They never pretend to process content.

## Non-goals

Owlie CLI does not provide:

- a web UI, authentication, billing, or credits
- source monitoring, schedules, or cron
- a local database or persistent job records
- Reddit OAuth, comment-tree extraction, or HTML scraping
- generic webpage extraction
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
packages/adapter-youtube/    YouTube adapter
packages/adapter-podcast/    Podcast adapter
packages/adapter-rss/        RSS/Atom adapter
packages/adapter-reddit/     Reddit adapter (Atom transport only)
packages/provider-openai/    OpenAI content processor (scaffold)
packages/provider-whisper/   Local faster-whisper transcriber (scaffold)
docs/                        Architecture, contracts, security, decisions
```

## Packages

| Package                     | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `@owlieio/core`             | Types, contracts, errors, limits, orchestration |
| `@owlieio/testing`          | Fakes, fixtures, contract-test helpers          |
| `@owlieio/adapter-youtube`  | YouTube playlists and videos                    |
| `@owlieio/adapter-podcast`  | Podcast episodes                                |
| `@owlieio/adapter-rss`      | RSS/Atom feeds and entries                      |
| `@owlieio/adapter-reddit`   | Subreddits via public Atom feeds                |
| `@owlieio/provider-openai`  | OpenAI `ContentProcessor`                       |
| `@owlieio/provider-whisper` | Local faster-whisper `Transcriber`              |
| `owlie`                     | The `owlie` command-line interface (published)  |

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

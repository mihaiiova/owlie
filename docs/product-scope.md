# Product scope

This document separates what exists now, what the v0.1 milestone will deliver,
what is deferred, and what belongs to the hosted product.

## Scaffold scope (current)

- Monorepo tooling: pnpm workspaces, TypeScript, Vitest, ESLint, Prettier,
  Changesets, GitHub Actions CI.
- `@owlieio/core` provider-neutral contracts and types.
- Adapter scaffolds with pure, tested URL recognition/normalization (YouTube,
  podcast, RSS/Atom, Reddit).
- Provider scaffolds (OpenAI, local faster-whisper) with public config types
  and no network calls.
- `@owlieio/testing` fakes, fixtures, and contract-test helpers.
- `owlie` CLI with functional `--help`, `--version`, and `doctor`.
- Full documentation and ADRs.

## v0.1 scope (the first functional milestone)

v0.1 is a deliberately small, pipe-first slice. The functional commands are:

- `owlie extract URL` — extract an available transcript from an individual
  YouTube video, the readable text of a static article, or the bounded linked
  items of an RSS/Atom feed, as normalized documents.
- `owlie list FEED_URL [--limit N] [--json]` — list bounded entries of an
  RSS/Atom feed.
- `owlie process [FILE] --prompt "..."` — process plain text or a normalized
  document with DeepSeek, reading from a positional file, `--input FILE`, or
  stdin.
- `owlie process FEED_URL --each [--limit N] --prompt "..."` — process the
  bounded linked items of an RSS/Atom feed sequentially, streaming one JSONL
  record per attempted item.
- `owlie doctor` — report whether required dependencies and variables are
  present.
- `owlie --help` / `owlie --version`.

These compose over Unix pipes:

```bash
owlie extract URL | owlie process --prompt "Summarize this"
owlie extract URL --json | owlie process --input-format json --prompt "..." --json
```

Output serialization in v0.1: `text` (raw), `markdown`, and `json`. `jsonl`
is used by `process --each` to stream one record per attempted feed item;
other commands do not use `jsonl`.

## Deferred capabilities

- Collection search (`search`) and `owlie run`. Bounded RSS/Atom `list` and
  `process --each` are functional; collection search remains deferred.
- Source monitoring and scheduled/recurring execution.
- Whisper/audio transcription; podcasts; Reddit. RSS/Atom entry extraction
  (the adapter's `extract`) remains deferred; its bounded `list` is functional.
- A local database or persistent job records.
- Reddit OAuth, credentials, comment-tree extraction, and HTML scraping.
- Following external links from RSS entries, generic crawling, and browser-rendered
  webpage extraction. The reusable static `article` adapter is the narrow
  exception: it extracts a directly supplied safe HTTP(S) editorial page from
  server-rendered HTML only. Universal `extract` dispatch (YouTube video,
  article, or bounded feed) is functional in v0.1.
- Automatic package publishing and Windows support guarantees.

## Hosted-app responsibilities (`owlie-app`)

The web UI, authentication and users, billing and credits, Postgres
persistence, hosted job queues and workers, source monitoring and schedules,
notifications, hosted media storage and delivery, analytics, administrative
functionality, and cloud deployment. None of these appear in `owlie-cli`.

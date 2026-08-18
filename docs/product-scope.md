# Product scope

This document separates what exists now, what the first functional CLI will do,
what is deferred, and what belongs to the hosted product.

## Scaffold scope (current)

- Monorepo tooling: pnpm workspaces, TypeScript, Vitest, ESLint, Prettier,
  Changesets, GitHub Actions CI.
- `@owlieio/core` provider-neutral contracts and types.
- Adapter scaffolds with pure, tested URL recognition/normalization.
- Provider scaffolds (OpenAI, local faster-whisper) with public config types
  and no network calls.
- `@owlieio/testing` fakes, fixtures, and contract-test helpers.
- `@owlieio/cli` with functional `--help`, `--version`, and `doctor`.
- Full documentation and ADRs.

## First functional CLI scope

- `owlie list` — list bounded items in a collection.
- `owlie extract` — extract normalized text or a transcript from an item.
- `owlie search` — search collection-provided fields (title, description,
  author, feed text, metadata) with a default limit of 10.
- `owlie process` — process a document (or each item in a bounded collection)
  with an LLM.
- `owlie config` — view and edit local configuration.
- Output serialization to `text`, `markdown`, `json`, and `jsonl`.

## Deferred capabilities

- Full-content extraction before search (`--content`, reserved).
- Source monitoring and scheduled/recurring execution.
- A local database or persistent job records.
- Reddit OAuth, credentials, comment-tree extraction, and HTML scraping.
- Following external links from RSS entries and generic webpage extraction.
- Automatic package publishing and Windows support guarantees.

## Hosted-app responsibilities (`owlie-app`)

The web UI, authentication and users, billing and credits, Postgres
persistence, hosted job queues and workers, source monitoring and schedules,
notifications, hosted media storage and delivery, analytics, administrative
functionality, and cloud deployment. None of these appear in `owlie-cli`.

# AGENTS.md — Owlie CLI

Coding agents must read this file before modifying the repository. Nested
`AGENTS.md` files add local rules without repeating this document.

## 1. Repository purpose

Owlie CLI is an open-source, local-first content extraction and processing
tool. It turns sources (YouTube, podcasts, Reddit, RSS/Atom) into normalized
text that can be searched, transcribed, and processed with an LLM — locally.

## 2. Current implementation status

This is a **scaffold**. Contracts compile, tests pass, and `pnpm check` is
green. No real extraction, search, transcription, or processing exists yet.
Only `owlie --help`, `owlie --version`, and `owlie doctor` are functional.

## 3. v1 scope and non-goals

In scope: collection/type contracts, source adapters, collection discovery,
extraction, transcription interfaces, LLM processing interfaces, bounded
collection processing, collection search, progress events, output
serialization, and reusable adapters/providers.

Explicit non-goals for v1: source monitoring, scheduling, cron, daemons, a
local database, persistent job records, Reddit OAuth/credentials/comments/HTML
scraping, following external links from RSS entries, generic webpage
extraction, automatic publishing, and Windows support guarantees.

## 4. Boundary with `owlie-app`

`owlie-app` is the private hosted product (UI, auth, billing, Postgres, job
queues, monitoring, schedules, notifications, storage, analytics, admin,
deployment). `owlie-cli` is the canonical owner of reusable content
functionality. Dependency direction is one-way:

```text
owlie-app → installs released → owlie-cli packages
```

Never import files or packages from `owlie-app`. Never introduce hosted
concepts (user IDs, billing, Stripe, Better Auth, Hono routes, Postgres,
Railway, R2, PostHog, Resend, hosted feed/playback state, cron) into this
repository.

## 5. Package and directory map

```text
apps/cli/                    @owlieio/cli (the owlie executable)
packages/core/               @owlieio/core (types, contracts, orchestration)
packages/testing/            @owlieio/testing (fakes, fixtures, contract tests)
packages/adapter-youtube/    @owlieio/adapter-youtube
packages/adapter-podcast/    @owlieio/adapter-podcast
packages/adapter-rss/        @owlieio/adapter-rss
packages/adapter-reddit/     @owlieio/adapter-reddit
packages/provider-openai/    @owlieio/provider-openai
packages/provider-whisper/   @owlieio/provider-whisper
docs/                        Architecture, contracts, security, decisions
```

## 6. Dependency-direction rules

```text
@owlieio/core        → platform APIs + minimal generic deps; never adapters/providers/CLI/hosted
adapters             → @owlieio/core only (never providers/CLI/hosted)
providers            → @owlieio/core only (never adapters/CLI/hosted)
@owlieio/testing     → @owlieio/core only (fakes, fixtures, contract helpers)
@owlieio/cli         → composes core, adapters, providers (owns terminal/env/config)
```

Documented exception: `adapter-reddit` may reuse public RSS/Atom parsing from
`adapter-rss`. Reddit URL normalization and metadata interpretation stay in
`adapter-reddit`. Do not create a generic `utils` package. `pnpm check:deps`
enforces these rules automatically.

## 7. Canonical commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm format
pnpm format:check
pnpm check
pnpm cli --help
pnpm cli --version
pnpm cli doctor
```

`pnpm check` runs every non-mutating gate required before merge.

## 8. Item-versus-collection model

Model collections and items separately. Collections: YouTube playlist,
subreddit, RSS/Atom feed. Items: YouTube video, podcast episode, Reddit post,
RSS/Atom entry. A collection adapter recognizes, resolves, lists bounded items
with stable identities, and exposes metadata. An item adapter recognizes or
resolves an item, extracts a `NormalizedDocument`, emits provider-neutral
progress events, and supports cancellation. Not every document is a transcript:
YouTube/podcast documents may contain transcripts; Reddit/RSS documents contain
normalized written text.

## 9. Adapter and provider rules

- Keep URL recognition/normalization pure and testable without network.
- Public contracts must not expose SDK-specific types (OpenAI, Whisper, RSS
  libraries).
- Core, adapters, and providers receive explicit configuration objects; only
  the CLI loads environment files.
- Providers are non-functional until approved; they must never make network
  calls or read environment variables during scaffolding.

## 10. Provider-neutral core requirement

`@owlieio/core` defines `ContentLocator`, `ContentCollection`, `ContentItem`,
`NormalizedDocument`, `ProcessRequest`, `ProcessResult`, and the adapter,
transcriber, processor, progress, and serializer contracts. No OpenAI model
names, SDK types, pricing, hosted tiers, or environment loading in core.

## 11. Collection bounds requirement

Every collection operation is bounded. Default limit is 10; limits must be
positive integers and never exceed the maximum. Do not permit an unbounded
"process everything" operation. Use `assertBoundedLimit` / `resolveLimit` from
`@owlieio/core`.

## 12. Security requirements

No real network requests in the default test suite. Enforce SSRF protection,
safe XML parsing (entity-expansion protection), no shell interpolation in
subprocess calls, secret redaction, sanitized fixtures, and no silent fallback
to HTML scraping. See `docs/security-model.md`.

## 13. Fixture and test expectations

Tests must require no credentials, make no paid API calls, make no external
network calls, avoid machine-specific snapshots, and run on macOS/Linux CI.
Add unit tests for pure logic and contract tests for adapters/providers using
`@owlieio/testing`.

## 14. Documentation-update requirements

When behavior or architecture changes, update the relevant file in `docs/`,
the README, the CHANGELOG, and add an ADR under `docs/decisions/` for
architectural decisions. Keep docs internally consistent.

## 15. Migration workflow from `owlie-app`

When porting a capability from `owlie-app`, follow `docs/migration-playbook.md`:
record observable behavior, create sanitized fixtures and characterization
tests, remove hosted assumptions, implement in the correct package, add tests,
verify in `owlie-app`, publish only after approval, and remove the private
implementation only after parity. Never copy credentials, env files, user data,
database code, billing, auth, analytics, deployment config, or private
fixtures.

## 16. Working-tree hygiene

Preserve unrelated user changes. Do not reformat or rewrite files outside the
scope of the task. Keep the tree reviewable; `git status` should show only
intended changes.

## 17. No commit / push / publish / release / deploy

Never commit, push, publish, release, or deploy without explicit permission.
This includes creating npm accounts, organizations, tags, or releases.

## 18. No credentials

Never add credentials, tokens, API keys, or secrets to source, fixtures, logs,
or snapshots. `.env.example` must contain only empty, documented variables.

## 19. Definition of done

A change is done when: it compiles, `pnpm check` passes, tests cover the
behavior, documentation and ADRs are updated, dependency rules hold, no
credentials or hosted concepts were introduced, and nothing was committed,
pushed, or published.

## 20. Prefer existing contracts

Prefer existing contracts and helpers over new, parallel pipelines. If a
capability can be expressed with `CollectionAdapter`, `ItemAdapter`,
`ContentProcessor`, `Transcriber`, or the orchestration helpers, use them
rather than introducing new abstractions or duplicating logic.

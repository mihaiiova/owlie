# Architecture

Owlie CLI is a pnpm/TypeScript monorepo of small, focused packages around a
provider-neutral core.

## Package diagram

```text
                        ┌──────────────────────┐
                        │        owlie         │  apps/cli (published)
                        │  (owlie executable)  │
                        └──────┬─────────┬─────┘
                               │ bundles │
        ┌──────────────┬───────┴────┐ ┌────┴───────────────┐
        ▼              ▼            ▼ ▼                    ▼
 adapter-youtube   adapter-article  adapter-reddit    provider-openai
 adapter-podcast                            provider-whisper
        │              │            │  │           │
        └──────────────┴───┬────────┘  └─────┬─────┘
                           ▼                 ▼
                     ┌───────────────────────────┐
                     │        @owlieio/core      │
                     │  types · contracts · ops  │
                     └───────────────────────────┘

        @owlieio/testing  ──depends on──▶  @owlieio/core
```

Only `owlie` is published. The `@owlieio/*` packages are internal (private) and
are bundled into `owlie` at build time.

## Dependency direction

```text
owlie-app  →  runs `owlie` CLI (container/subprocess)
```

`owlie-app` does not import `owlie-cli` packages as libraries. Within the
monorepo:

- `@owlieio/core` has no Owlie dependencies; its safe-HTTP implementation uses
  the generic `ipaddr.js` parser for canonical destination classification.
- Adapters depend only on `@owlieio/core` (Reddit also reuses
  `@owlieio/adapter-rss` parsing).
- Providers depend only on `@owlieio/core`.
- `@owlieio/testing` depends only on `@owlieio/core`.
- `owlie` bundles core, adapters, and providers into one self-contained build.

`pnpm check:deps` enforces these rules and detects undeclared cross-package
imports.

## Item and collection lifecycle

1. A user supplies a `ContentLocator` (URL plus optional hint).
2. An adapter `recognize`s the locator.
3. A `CollectionAdapter.resolve` produces a canonical `ContentCollection` with a
   stable identity; an `ItemAdapter.resolveItem` produces a `ContentItem`.
4. A collection adapter `list`s bounded items with stable identities and
   metadata.
5. An item adapter `extract`s an item into a `NormalizedDocument`. The article
   adapter uses core's bounded `HttpFetcher` response, then extracts only the
   fetched static HTML; it never delegates URL retrieval to an extractor. The
   fetcher permits only globally routable unicast destinations by default,
   applies a narrow private/local opt-in, rejects URL userinfo, and omits query
   and fragment data from diagnostics.

## Extraction lifecycle

1. `extract` receives a resolved `ContentItem` and optional `AbortSignal` and
   `ProgressSink`.
2. The adapter fetches content (bounded, timeouts, redirect limits) and
   normalizes it into a `NormalizedDocument` with a `mediaType`
   (`text`, `transcript`, or `mixed`).
3. For audio/video, extraction may delegate to a `Transcriber`.
4. Progress events flow through the `ProgressSink`; cancellation is honored
   throughout.

## Processing lifecycle

1. A `NormalizedDocument` is wrapped in a `ProcessRequest` (instruction and
   optional output schema).
2. A `ContentProcessor` processes it. In v0.1 the functional processor is
   `@owlieio/provider-deepseek`; `@owlieio/provider-openai` remains a
   non-functional scaffold.
3. The `ProcessResult` (`text` | `markdown` | `json`) is serialized by an
   `OutputSerializer` and written to stdout or a file.

## CLI composition

The CLI owns terminal behavior, environment-file loading, and local
configuration. It routes commands to adapters/providers, enforces collection
bounds, emits progress to stderr, and writes results to stdout. Only the CLI
entry point (`apps/cli/src/bin.ts`) translates failures into exit codes.

For `extract`, the CLI dispatches a direct URL through an ordered item-adapter
registry — specialized adapters first (YouTube), then the article adapter for
remaining safe HTTP(S) URLs. A recognized RSS/Atom feed instead enters a
bounded linked-item batch extraction that writes a single JSON envelope of
per-item documents or structured errors.

## Future hosted-app integration

`owlie-app` runs the published `owlie` binary as a subprocess (typically in a
container) and reads its stdout / exit codes — it keeps its own persistence,
scheduling, and user/billing layers on top. It never imports the internal
`@owlieio/*` packages.

## Scheduling

Scheduling and monitoring remain in `owlie-app`. Owlie CLI never monitors
sources or schedules recurring work.

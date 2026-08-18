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
 adapter-youtube   adapter-…   adapter-reddit    provider-openai
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

- `@owlieio/core` has no Owlie dependencies.
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
5. An item adapter `extract`s an item into a `NormalizedDocument`.

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
2. A `ContentProcessor` (for example `@owlieio/provider-openai`) processes it.
3. The `ProcessResult` (`text` | `markdown` | `json`) is serialized by an
   `OutputSerializer` and written to stdout or a file.

## CLI composition

The CLI owns terminal behavior, environment-file loading, and local
configuration. It routes commands to adapters/providers, enforces collection
bounds, emits progress to stderr, and writes results to stdout. Only the CLI
entry point (`apps/cli/src/bin.ts`) translates failures into exit codes.

## Future hosted-app integration

`owlie-app` runs the published `owlie` binary as a subprocess (typically in a
container) and reads its stdout / exit codes — it keeps its own persistence,
scheduling, and user/billing layers on top. It never imports the internal
`@owlieio/*` packages.

## Scheduling

Scheduling and monitoring remain in `owlie-app`. Owlie CLI never monitors
sources or schedules recurring work.

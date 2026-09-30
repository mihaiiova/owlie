# Architecture

Owlie CLI is a pnpm/TypeScript monorepo of small, focused packages around a
provider-neutral core.

## Package diagram

```text
apps/cli (owlie, published)
  └─ bundles ─┬─ adapter-youtube    ─▶ @owlieio/core
              ├─ adapter-podcast    ─▶ @owlieio/core
              ├─ adapter-article    ─▶ @owlieio/core
              ├─ adapter-rss        ─▶ @owlieio/core
              ├─ adapter-reddit     ─▶ @owlieio/core (reuses adapter-rss parsing)
              ├─ provider-openai    ─▶ @owlieio/core
              ├─ provider-deepseek  ─▶ @owlieio/core
              └─ provider-whisper   ─▶ @owlieio/core

@owlieio/testing ─▶ @owlieio/core
```

Only `@owlieio/owlie` is published. The other `@owlieio/*` packages are internal
(private) and are bundled into `@owlieio/owlie` at build time.

## Dependency direction

```text
consuming product  →  runs `owlie` CLI (container/subprocess)
```

Consuming products (the private `owlie-app` is the first) do not import
`owlie-cli` packages as libraries. Within the monorepo:

- `@owlieio/core` has no Owlie dependencies; its safe-HTTP implementation uses
  the generic `ipaddr.js` parser for canonical destination classification.
- Adapters depend only on `@owlieio/core` (Reddit reuses
  `@owlieio/adapter-rss` parsing; `adapter-podcast` reuses it solely for the
  Apple Podcasts enclosure fallback).
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
2. A `ContentProcessor` processes it. In v0.1 the functional processors are
   `@owlieio/provider-deepseek` and `@owlieio/provider-openai`. The model is
   selected with `--model provider/model-id` (self-contained), or a plain
   `--model id` with the deprecated `--provider` alias → `OWLIE_PROVIDER` →
   saved active provider. Live model discovery goes through the provider-neutral
   `ProviderCatalog` contract (`owlie models`).
3. The `ProcessResult` (`text` | `markdown` | `json`) is written directly to
   stdout (or a file) by the CLI. `OutputSerializer` remains a reserved
   provider-neutral contract with no v0.1 implementation.

## CLI composition

The CLI owns terminal behavior, environment-file loading, and local
configuration. It routes commands to adapters/providers, enforces collection
bounds, emits progress to stderr, and writes results to stdout. Only the CLI
entry point (`apps/cli/src/bin.ts`) translates failures into exit codes.

For `extract`, the CLI dispatches a direct URL through an ordered item-adapter
registry — specialized adapters first (YouTube, then podcast media, Apple
Podcasts episodes, and server-rendered episode pages with declarative audio).
A remaining safe HTTP(S) page is classified by the article adapter from one
fetch (reusing the page an episode-page resolver already fetched): an article
page becomes a single document, and any other page goes to bounded feed
discovery with the same response (ADR 0035). A recognized RSS/Atom feed
instead enters a bounded linked-item batch extraction that writes a single
JSON envelope of per-item documents or structured errors.

## Integration by consuming products

A consuming product runs the published `owlie` binary as a subprocess
(typically in a container) using `--hosted` and the versioned `--json`
protocol, and reads its stdout, stderr records, and exit codes. It keeps its
own persistence, scheduling, and user/billing layers on top, and never imports
the internal `@owlieio/*` packages. The contract is the same for every product
(ADR 0034); see
[Integrating Owlie as a subprocess](cli-contract.md#integrating-owlie-as-a-subprocess).

## Scheduling

Scheduling and monitoring belong to consuming products. Owlie CLI never
monitors sources or schedules recurring work.

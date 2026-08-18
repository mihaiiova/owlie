# @owlieio/core

Provider-neutral contracts, types, and orchestration primitives for Owlie CLI.

This package is the canonical owner of the shared vocabulary that every adapter,
provider, and the CLI build on. It contains no SDK-specific types, no model
names, no environment-variable loading, and no network access.

## Contents

- `types.ts` — `ContentLocator`, `ContentCollection`, `ContentItem`,
  `NormalizedDocument`, `ProcessRequest`, `ProcessResult`, and the `SourceType`
  / `MediaType` unions.
- `contracts.ts` — `SourceAdapter`, `CollectionAdapter`, `ItemAdapter`,
  `ContentExtractor`, `CollectionDiscovery`, `Transcriber`, `ContentProcessor`,
  `ProgressSink`, and `OutputSerializer`.
- `progress.ts` — the `ProgressEvent` discriminated union.
- `errors.ts` — the typed error hierarchy (throw these; never `process.exit`).
- `limits.ts` — bounded collection limits (`DEFAULT_COLLECTION_LIMIT = 10`,
  `MAX_COLLECTION_LIMIT = 500`).
- `output.ts` — the reserved output formats.
- `orchestration.ts` — `listCollection`, `resolveItem`, and `extractItem`.

## Dependency rules

`@owlieio/core` may use platform APIs and minimal generic dependencies. It must
never depend on adapters, providers, the CLI, or hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```

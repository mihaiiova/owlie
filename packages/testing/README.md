# @owlieio/testing

Fakes, fixtures, and contract-test helpers for Owlie CLI.

This package exists so that adapters, providers, and the CLI can test against
well-behaved in-memory implementations instead of real network access or paid
APIs. The default test suite makes no network calls and requires no credentials.

## Entries

- `@owlieio/testing` — fakes and fixtures (no test-runner dependency).
  - `makeCollection`, `makeItem`, `makeDocument`
  - `FakeCollectionAdapter`, `FakeItemAdapter`
  - `FakeContentProcessor`, `FakeTranscriber`, `FakeProgressSink`
- `@owlieio/testing/contract-tests` — contract-test helpers that run against an
  implementation using Vitest. Requires `vitest` in the consuming project.
  - `collectionAdapterContract`
  - `itemAdapterContract`
  - `processorContract`
  - `transcriberContract`

## Dependency rules

`@owlieio/testing` may depend only on `@owlieio/core`. It provides fakes,
fixtures, and contract-test helpers — never production logic.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```

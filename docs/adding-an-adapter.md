# Adding an adapter

Adapters are the seam that turns a source URL into collections, items, and
normalized documents.

## Steps

1. Create `packages/adapter-<name>/` with the standard package layout
   (`package.json`, `tsconfig.json`, `tsconfig.build.json`, `README.md`,
   `src/`, `test/`).
2. Depend on `@owlieio/core` (and, for Reddit only, `@owlieio/adapter-rss`).
3. Implement pure `recognize` and URL normalization first — no network.
4. Implement `resolve` (collection) and/or `resolveItem` (item) returning
   stable identities.
5. Implement `list`/`extract` behind a `NotImplementedError` until real network
   work is approved; honor `AbortSignal`, `ProgressSink`, and bounded limits.
6. Add pure-logic unit tests and, once list/extract exist, wire the
   `collectionAdapterContract` / `itemAdapterContract` helpers.
7. Keep provider/SDK-specific types out of the public surface.
8. Update the README, dependency map, and any affected docs/ADRs.

## Checklist

- Only `@owlieio/core` (plus the documented RSS exception) as a dependency.
- Bounded collection operations (`assertBoundedLimit`).
- No real network calls in the default test suite.
- No credentials or hosted concepts.

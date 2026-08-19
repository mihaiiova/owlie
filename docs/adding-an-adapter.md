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
7. Register the adapter once it is functional so it is bundled into `owlie`
   and reported by `owlie doctor`. Scaffolds whose `list`/`extract` still throw
   `NotImplementedError` must stay out of the registry. A new package must be
   added in all of these places:

   1. `apps/cli/src/registry.ts` — import the class, add its id to
      `ADAPTER_IDS`.
   2. `apps/cli/package.json` — add it to `devDependencies`.
   3. `scripts/check-dependencies.mjs` — add it to `PACKAGES` and `ALLOWED`.
   4. `tsconfig.base.json` — add a `paths` entry.
   5. `vitest.config.ts` — add an `alias` entry.
   6. `.changeset/config.json` — add it to `ignore`.

8. Keep provider/SDK-specific types out of the public surface.
9. Update the README, dependency map, and any affected docs/ADRs.

## Checklist

- Only `@owlieio/core` (plus the documented RSS exception) as a runtime
  dependency; `@owlieio/testing` is allowed as a test-only `devDependency`.
- Bounded collection operations (`assertBoundedLimit`).
- No real network calls in the default test suite.
- No credentials or hosted concepts.
- Internal (`private`) package — never published; bundled into `owlie`.

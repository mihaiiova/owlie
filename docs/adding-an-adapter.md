# Adding an adapter

Adapters are the seam that turns a source URL into collections, items, and
normalized documents.

## Adding an audio source (resolver + flag)

An _audio source_ is a place where the audio file URL can be found for a given
URL. Adding one does **not** create a new adapter package: it adds a resolver
behind the existing `PodcastAudioResolver` seam in `adapter-podcast`, plus a
resolver-selection flag, and reuses the generic local transcription pipeline
unchanged. See ADR 0022.

### Steps

1. Implement `PodcastAudioResolver` in `packages/adapter-podcast/src/`:
   - `recognize(locator)` — pure URL recognition, no network.
   - `resolve(locator, { signal })` — fetch through the injected `HttpFetcher`,
     honor `AbortSignal`, validate the final media URL with
     `assertSafeHttpUrl` (never trust a raw URL from the page), and return
     `{ mediaUrl, metadata: { resolvedFrom, title? } }`.
2. Export it from `packages/adapter-podcast/src/index.ts`.
3. Register it in `PODCAST_RESOLVER_REGISTRY` (`apps/cli/src/resolvers.ts`),
   after more specific resolvers. This single registry maps the stable resolver
   `name` to both its factory and its `flag`, so recognition order, the
   resolver-selection flag, and `owlie resolve` all derive from it with no
   other change.
4. Set the `flag` to the `--<source-type>-<resolver-name>` selection flag and
   the `name` to the stable resolver name, following `--podcast-<name>` for
   podcast audio sources (for example `--podcast-apple`, `--podcast-shopify`).
   The boolean flag is available on `owlie extract` and `owlie resolve`, and it
   overrides recognition: a mismatch is a clear error, not a silent fallback.
5. Add unit tests for `recognize` (pure) and `resolve` (using
   `@owlieio/testing` fakes — no real network), plus a contract test against
   the resolver seam.
6. Record a changeset and update any affected docs.

### Rules

- The resolver returns only a validated media URL plus metadata. It never
  downloads audio and never transcribes — transcription belongs to the shared
  pipeline.
- Do not add provider/SDK-specific types to the resolver's public surface.
- A new audio source never forks `WhisperLocalTranscriber` or introduces a new
  transcription code path.

## Steps

1. Create `packages/adapter-<name>/` with the standard package layout
   (`package.json`, `tsconfig.json`, `tsconfig.build.json`, `README.md`,
   `src/`, `test/`).
2. Depend on `@owlieio/core` (and, for Reddit and the podcast Apple enclosure
   fallback, `@owlieio/adapter-rss`).
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

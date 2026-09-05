# Adding a provider

Providers implement `ContentProcessor` (LLM) or `Transcriber` (transcription).

## Steps

1. Create `packages/provider-<name>/` with the standard package layout.
2. Depend only on `@owlieio/core` (plus a generic SDK such as `ai` and the
   provider's `@ai-sdk/*` package once the provider becomes functional).
3. Define a public configuration type; receive it as an explicit object and
   never read environment variables.
4. Implement `id` and the contract method. During scaffolding, the method
   throws `NotImplementedError` and never makes network calls.
5. Add configuration-validation unit tests.
6. Wire the `processorContract` / `transcriberContract` helpers once real
   behavior exists.
7. Add a fake to `@owlieio/testing` so consumers can test against it.
8. Register the provider once it is functional so it is bundled into `owlie`
   and reported by `owlie doctor`. Scaffolds whose `process`/`transcribe` still
   throw `NotImplementedError` must stay out of the registry. For a functional
   LLM provider, register it provider-first in `apps/cli/src/registry.ts` with
   its `id`, default model-discovery `baseUrl`, and a `create` factory; it is
   then reported automatically by `PROVIDER_IDS`/`listProviders`. A new package
   must be added in all of these places:

   1. `apps/cli/src/registry.ts` — import the class and add a
      `{ id, baseUrl, create }` registration (its id flows into
      `PROVIDER_IDS`).
   2. `apps/cli/package.json` — add it to `devDependencies`.
   3. `scripts/check-dependencies.mjs` — add it to `PACKAGES` and `ALLOWED`.
   4. `tsconfig.base.json` — add a `paths` entry.
   5. `vitest.config.ts` — add an `alias` entry.
   6. `.changeset/config.json` — add it to `ignore`.

9. Update the README, dependency map, and any affected docs/ADRs.

## Checklist

- Only `@owlieio/core` as a `@owlieio/*` runtime dependency; generic SDK
  packages (`ai`, `@ai-sdk/*`) are permitted once the provider is functional.
  `@owlieio/testing` is allowed as a test-only `devDependency`.
- No SDK-specific types in `@owlieio/core`.
- No environment-variable loading in the provider.
- No network calls or secret handling during scaffolding.
- For transcribers, document ffmpeg/ffprobe/Python requirements and enforce
  subprocess calls without shell interpolation when implemented.
- Internal (`private`) package — never published; bundled into `owlie`.

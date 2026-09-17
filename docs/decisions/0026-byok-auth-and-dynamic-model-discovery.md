# ADR 0026 — BYOK auth and dynamic model discovery

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** the model-selection and no-cache decisions in
  [ADR 0017](0017-openai-provider-and-explicit-provider-selection.md) and the
  hardcoded-fallback/no-stale-cache decisions in [ADR 0007](0007-setup-and-user-config.md).

## Context

LLM-provider support was fragmented across three surfaces: credentials and the
active provider were only settable through the guided `owlie setup` flow, live
model discovery lived inside `setup` with no standalone command and no cache,
and selecting a model required two separate flags (`--provider` + `--model`)
that could silently drift. Model listing lived in the CLI (`listProviderModels`)
rather than in a provider-neutral catalog, so exposing a provider's new models
appeared to require an Owlie release.

## Decision

- Add a provider-neutral `ProviderCatalog` contract and `ModelInfo` type to
  `@owlieio/core`:
  `ProviderCatalog.listModels(credentials: { apiKey, baseUrl? }) → ModelInfo[]`.
  It is implemented by `@owlieio/provider-openai` and
  `@owlieio/provider-deepseek` and is the extension point for future providers.
  It stays SDK-free and provider-neutral; generation remains in
  `ContentProcessor` on the Vercel AI SDK.
- The catalog fetches the provider's authenticated `GET {baseUrl}/models`
  (`Authorization: Bearer`), validates the declared `Content-Type` is JSON
  before parsing, and maps `data[].id` to `ModelInfo`. There is no curated
  model list: model ids are discovered dynamically. `capabilities` fields are
  optional and normalized only from what the provider returns, never guessed
  from names.
- `owlie process` gains a single canonical `--model` flag. `--model
provider/model-id` is self-contained; a plain `--model model-id` resolves the
  provider from the deprecated `--provider` alias → `OWLIE_PROVIDER` → the saved
  active provider. A `--provider` that disagrees with a compound `--model`
  provider errors (no silent precedence). Unknown-but-valid model ids pass
  through; the provider SDK returns the authoritative error at request time.
- `owlie auth add|list|remove <provider>` manages API keys in the existing
  user-level `~/.config/owlie/config.json` provider profiles (still `0600`,
  gitignored). `owlie auth list` reports the effective credential source
  (`environment` vs `stored`) and never the secret. Environment variables
  override stored keys (precedence unchanged).
- `owlie models [--provider <provider>] [--refresh] [--json]` lists models via
  the catalog contract, backed by a 1-hour TTL JSON cache at
  `~/.cache/owlie/models.json`. `--refresh` forces a live fetch; a failed fetch
  falls back to a cached list with a clear "using cached list from <timestamp>"
  diagnostic, and fails clearly when there is no cache.
- `owlie setup` model discovery now goes through the catalog contract; the
  hand-rolled CLI `listProviderModels` fetch is removed. `owlie doctor` reports
  the per-provider credential source without echoing secrets.
- The CLI registry entry is now `{ id, baseUrl, catalog, createProcessor }`,
  so adding a provider remains a single localized registration.

## Consequences

- Providers expose models dynamically; new provider models appear without an
  Owlie release.
- A model id now may imply its provider (the compound form), reversing ADR
  0017's "a model id never implies a provider".
- Model discovery gains a bounded cache, reversing the "no stale cache" stance
  in ADR 0007/0017; the provider remains the source of truth and stale data is
  only shown with an explicit diagnostic.
- Credentials are manageable outside `owlie setup` via `owlie auth`, sharing
  the same store.

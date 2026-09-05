# ADR 0017 — OpenAI provider and explicit provider selection

- **Status:** Accepted
- **Date:** 2026-08-28
- **Supersedes:** the DeepSeek-only decision in [ADR 0005](0005-v0-1-scope.md);
  amends the flat-config and setup decisions in [ADR 0007](0007-setup-and-user-config.md).

## Context

v0.1 shipped DeepSeek as the only functional LLM provider. `owlie process`
inferred that single provider from its model id, and the saved LLM
configuration was a flat `{ provider, model, apiKey, baseUrl }` shape that could
only retain one provider's credentials. [Idea #58](../README.md) requested
OpenAI as a functional provider alongside DeepSeek so callers — including the
hosted app at the executable boundary — can select OpenAI without changing
provider or model.

## Decision

- Make `@owlieio/provider-openai` a real provider-neutral `ContentProcessor`
  using `ai` and `@ai-sdk/openai`, mirroring DeepSeek's prompt construction,
  cancellation/error mapping, timeout/signal forwarding, and JSON-format
  behavior. OpenAI has no default model: the model selected by setup,
  environment, or `--model` is required.
- Make provider selection explicit and provider-first throughout the CLI:
  `owlie process` and feed `process --each` select a provider by `--provider`,
  then `OWLIE_PROVIDER`, then the saved active provider. `--model` selects a
  model only within that provider; a model id never implies a provider.
- Configure each provider from its own `OPENAI_*`/`DEEPSEEK_*` variables with
  the existing precedence (flags → process env → `--env-file` → `.env.local` →
  `.env` → saved profile).
- Replace the flat saved LLM credential fields with an active provider plus
  provider-keyed profiles `{ model, apiKey, baseUrl? }`. Read the legacy flat
  DeepSeek shape with a safe backward-migration so existing users keep working,
  and write the canonical profile form with existing `0600` permissions.
- `owlie setup` discovers the chosen provider's authenticated live `/models`
  list and requires a successful non-empty result before a model can be chosen;
  no hard-coded fallback, typed free-form model, or stale cache.
- Both providers return the same `ProcessResult.metadata` convention:
  `provider`, `model`, and normalized API-reported `{ inputTokens?,
outputTokens?, totalTokens? }` usage when supplied. No pricing, credits,
  hosted concepts, or provider-specific types enter core.

## Consequences

- `@owlieio/core` stays unchanged and provider-neutral; OpenAI-specific client,
  configuration, and error mapping live in `packages/provider-openai`.
- Callers can switch the active provider or override it per command without
  overwriting either provider's saved key, base URL, or model.
- Existing DeepSeek users are migrated transparently on the next config read.
- `owlie doctor` reports non-secret per-provider readiness without treating one
  provider's key as another's.
- A setup user whose model discovery fails or returns an empty list receives a
  clear non-success diagnostic and no guessed/stale/fallback selection.

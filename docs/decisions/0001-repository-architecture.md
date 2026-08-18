# ADR 0001 — Repository and package architecture

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

Owlie's content functionality must be reusable by both a local CLI and the
hosted `owlie-app`, while keeping hosted concerns private. The code must be
modular, dependency-clean, and easy to publish.

## Decision

Use a pnpm-workspace monorepo with a provider-neutral core and thin
single-purpose packages:

- `@owlieio/core` — types, contracts, errors, limits, orchestration.
- `@owlieio/testing` — fakes, fixtures, contract-test helpers.
- `@owlieio/adapter-*` — one package per source adapter.
- `@owlieio/provider-*` — one package per processor/transcriber provider.
- `@owlieio/cli` — the executable.

Enforce a strict dependency direction (core ← adapters/providers ← CLI) with an
automated boundary check (`scripts/check-dependencies.mjs`). Keep packages
`private` until the `@owlieio` npm scope is owned.

## Consequences

- Clear ownership and one-way dependencies reduce accidental coupling to
  hosted concepts.
- A generic `utils` package is intentionally avoided; utilities live with their
  owning domain.
- The scope/name must be claimed or changed before the first release, and
  consumers must pin exact versions while packages are below `1.0`.

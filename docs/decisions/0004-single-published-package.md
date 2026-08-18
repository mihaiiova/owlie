# ADR 0004 — Single published package; `owlie-app` consumes the CLI

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

The original plan (ADR 0001) assumed `owlie-app` would install individual
`@owlieio/*` packages as libraries. In practice `owlie-app` runs the whole
`owlie` command as a subprocess in a container, and the only other consumers
are users who install the CLI standalone. No one cherry-picks individual
packages.

## Decision

- Publish a single package named `owlie` (unscoped; the name is available).
- Keep the `@owlieio/*` packages as internal, `private`, organization-only
  packages that enforce dependency boundaries and isolate tests.
- Bundle the internal packages into `owlie` at build time (tsup), so the
  published artifact is self-contained and has no runtime dependency on the
  private packages.
- `owlie-app` invokes `owlie` as a subprocess in a container, reading
  stdout/stderr and exit codes. It does not import `owlie-cli` packages.

## Consequences

- One version, one changelog, one publish (`pnpm publish`). No npm scope to
  claim, no cross-package version coordination.
- Adding an adapter or provider is still additive: a new internal
  `packages/adapter-*` (or `provider-*`) is bundled into `owlie` on the next
  release; no new npm package is published.
- The dependency-direction rules and boundary check remain, applied to the
  internal packages and the `owlie` bundle.
- The multi-package publishing ceremony (workspace-protocol conversion across
  packages, per-package `access`) is removed.

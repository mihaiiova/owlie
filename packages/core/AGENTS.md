# AGENTS — @owlieio/core

Local rules for coding agents working in this package. The root `AGENTS.md`
applies first; this file adds core-specific guidance without repeating it.

## What this package is

The provider-neutral foundation of Owlie CLI. It owns types, contracts, errors,
limits, output formats, and orchestration. It is a dependency of every adapter,
provider, and the CLI — never the other way around.

## Rules

1. **No provider-specific types.** Nothing here may import or re-export types
   from OpenAI, Whisper, RSS libraries, or other providers/SDKs.
2. **No OpenAI model names, pricing, credits, or hosted tiers.** Those belong to
   `provider-openai` and `owlie-app`, respectively.
3. **No environment-variable loading.** Configuration arrives as explicit
   objects. Only the `owlie` CLI loads environment files.
4. **No adapter/provider network clients.** Core is pure contracts and helpers,
   except `http.ts`, which owns the explicit, injectable `DefaultHttpFetcher`
   safe-HTTP boundary defined by ADR 0010. It must not read environment
   variables or introduce source-specific network behavior.
5. **Never call `process.exit`.** Throw typed errors (`errors.ts`) instead.
6. **Prefer discriminated unions** (like `ProgressEvent`) where they improve
   safety.
7. **Keep all collection operations bounded.** Extend `limits.ts` rather than
   adding unbounded paths.
8. **Do not add a generic `utils` package.** Utilities live with the domain that
   owns them; put them in the relevant core module.

## Contracts

Public contracts are in `contracts.ts`. When adding a contract, add or update a
test in `test/`, and keep the runtime helpers (`limits.ts`, `output.ts`,
`errors.ts`) dependency-free.

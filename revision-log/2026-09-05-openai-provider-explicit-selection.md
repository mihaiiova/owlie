# Review: spec/61 — OpenAI provider and explicit provider selection
**Date:** 2026-09-05
**Session:** Implemented functional `@owlieio/provider-openai`, explicit provider-first selection (`--provider` / `OWLIE_PROVIDER` / saved active), provider-keyed saved profiles with flat-config migration, live model discovery in `owlie setup`, per-provider doctor reporting, and matching docs/ADRs.

## History Checked
- 2026-08-28-release-validation-live-e2e.md
- 2026-08-27-safe-http-credential-policy.md
- 2026-08-27-ssrf-dns-resolution.md
- 2026-08-20-process-feed-batches.md
- 2026-08-20-universal-extract-feed-batches.md

## Recurring Patterns
- None found (no prior log names this round's gaps).

## Scores
| Dimension | Score |
|-----------|-------|
| Friction | 0.5 |
| Repetition | 0.4 |
| Missing capability | 0.4 |
| Knowledge gap | 0.7 |
| Fragility | 0.5 |

## Suggestions
| # | Category | Suggestion | Score | Accepted? |
|---|----------|------------|-------|-----------|
| 1 | documentation | When making a deferred scaffold functional, also update the package's own `README.md` (and grep the tree for stale "scaffold"/"NotImplementedError"/"deferred" references). The spec listed "provider README" but it was missed on the first pass and caught only by review. | 0.7 | ⏳ pending |

## Changes Made
- None yet (suggestion pending user acceptance).

## Notes
- Ambient state leak: `resolveProvider`/`resolveProviderSettings` default to the real `~/.config/owlie/config.json`, which surfaced real credentials and broke the "no provider selected" test until `readConfig` was threaded through the CLI seam. Worth keeping in mind for future CLI config seams.
- Two code-review findings were doc/code drift (precedence-chain wording in JSDoc/ADR, and `adding-a-provider.md` still saying "only @owlieio/core" while functional providers add SDK deps); both fixed.
- Reviewer flagged `buildPrompt`/`isAbortError`/usage-normalization duplication between the two providers as a judgement-call smell; accepted as-is because core must stay unchanged and the repo forbids a generic utils package.

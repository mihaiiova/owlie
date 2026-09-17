# Review: spec-review of #103 (BYOK auth + dynamic model discovery)

**Date:** 2026-09-17
**Session:** Reviewed `spec/103-llm-byok-auth-model-discovery` (11 commits vs
`development`). Parallel Standards + Spec sub-agents. Three blockers found and
fixed in-tree: (1) provider-SDK error messages were not redacted (R20/D15) —
added `redactSecrets` to core and wired the api key through `mapProcessingError`
in both processors; (2) a configured-but-gone default model produced no pointer
to `owlie models` (R16/D12) — added the hint in `process`; (3) catalogs threw
bare `Error`, violating the documented typed-error contract — switched to
`ExtractionError`. All eight `pnpm check`-equivalent gates pass.

## History Checked

- 2026-09-16-spec-review-79-packaged-extractor-runtime.md
- 2026-09-16-spec-review-77-direct-media-limits.md
- 2026-09-15-spec-review-91-audio-resolution-transcription.md
- 2026-09-15-spec-review-90-media-type-output-vocabulary.md
- 2026-09-13-spec-review-75-apple-podcasts.md

## Recurring Patterns

- None found. The changeset and content-type validation — the recurring gaps from
  earlier rounds — were both present this round.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.2   |
| Missing capability | 0.2   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.3   |

## Suggestions

| #   | Category | Suggestion                              | Score | Accepted? |
| --- | -------- | --------------------------------------- | ----- | --------- |
| —   | —        | No suggestion crossed the 0.6 threshold | —     | —         |

## Changes Made

- None (no accepted suggestions). The three review fixes are spec-scope
  corrections, not process changes.

## Notes

- Read-only reviewers (no shell) required self-contained patch artifacts; the
  fan-out worked but added minor ceremony (Friction 0.3, below threshold).
- Residual P2 findings are judgement calls, not blockers: near-duplicate
  `catalog.ts` across the two providers (AGENTS.md §6 forbids a shared utils
  package), spec-mandated `capabilities`/`AuthMethod` fields that are not yet
  consumed, the three-way env-merge order, and removed default-fetcher coverage
  in `setup.test.ts` (core `DefaultHttpFetcher` policy still tested directly).

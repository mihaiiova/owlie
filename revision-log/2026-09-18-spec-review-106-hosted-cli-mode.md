# Review: spec-review of #106 (deterministic hosted CLI mode)

**Date:** 2026-09-18
**Session:** Reviewed `spec/106-deterministic-hosted-cli-mode` against `development`. Parallel Standards and Spec reviewers found no documented-standard or acceptance-criterion blockers. The packed-artifact scenario initially asserted only the hosted policy label; it now seeds conflicting CWD `.env` and XDG profile/model-cache state and verifies injected environment settings win. `pnpm verify:artifact` passes.

## History Checked

- 2026-09-17-spec-review-103-byok-auth-model-discovery.md
- 2026-09-16-spec-review-79-packaged-extractor-runtime.md
- 2026-09-16-spec-review-77-direct-media-limits.md
- 2026-09-15-spec-review-91-audio-resolution-transcription.md
- 2026-09-15-spec-review-90-media-type-output-vocabulary.md

## Recurring Patterns

- None found. The prior artifact-verification review noted that a gated check needed static analysis; this round executed the relevant `pnpm verify:artifact` check successfully and strengthened its assertion.

## Scores

| Dimension | Score |
|-----------|-------|
| Friction | 0.3 |
| Repetition | 0.2 |
| Missing capability | 0.1 |
| Knowledge gap | 0.3 |
| Fragility | 0.5 |

## Suggestions

| # | Category | Suggestion | Score | Accepted? |
|---|----------|------------|-------|-----------|
| — | — | No suggestion crossed the 0.6 threshold | — | — |

## Changes Made

- None (no accepted process improvements). The strengthened packed-artifact scenario is a product-review correction in `scripts/verify-artifact.mjs`.

## Notes

- Read-only reviewers required a self-contained patch artifact, which caused minor review ceremony but not substantial friction.
- The review caught insufficient E2E isolation evidence before transition; the corrected test seeds conflicting CWD and home-directory configuration without adding a broader process change.

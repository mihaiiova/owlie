# Review: spec-review of #107 (versioned JSON subprocess protocol)

**Date:** 2026-09-18
**Session:** Reviewed `spec/107-versioned-json-subprocess-protocol` against `development`. Parallel Standards and Spec reviewers identified protocol gaps: progress completion records could expose result data, auth add/remove bypassed JSON envelopes, and resolver-selection validation used a configuration error despite being a usage error. The review corrected the implementation and added regression coverage.

## History Checked

- 2026-09-18-spec-review-106-hosted-cli-mode.md
- 2026-09-17-spec-review-103-byok-auth-model-discovery.md
- 2026-09-16-spec-review-79-packaged-extractor-runtime.md
- 2026-09-16-spec-review-77-direct-media-limits.md
- 2026-09-15-spec-review-91-audio-resolution-transcription.md

## Recurring Patterns

- None found. Earlier reviews also needed self-contained review artifacts, but this is normal review setup rather than a recurring development-round problem.

## Scores

| Dimension | Score |
| --- | --- |
| Friction | 0.3 |
| Repetition | 0.2 |
| Missing capability | 0.1 |
| Knowledge gap | 0.3 |
| Fragility | 0.5 |

## Suggestions

| # | Category | Suggestion | Score | Accepted? |
| --- | --- | --- | --- | --- |
| — | — | No suggestion crossed the 0.6 threshold | — | — |

## Changes Made

- None (no accepted process improvements).

## Notes

- Review corrections are product-scope fixes, not process improvements.
- `npm test`, `npm run build`, `npm run lint`, and `npm run typecheck` pass through the shared spec runner.

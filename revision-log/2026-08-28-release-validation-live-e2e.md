# Review: Release validation workflow with live E2E (spec #52)

**Date:** 2026-08-28
**Session:** Added a manually dispatched, validation-only release gate that packs `owlie` once, smoke-tests the exact artifact on Node 20/22, and runs a live end-to-end suite (controlled GitHub Pages corpus, a known YouTube video, DeepSeek) at the installed executable boundary.

## History Checked

- `2026-08-27-safe-http-credential-policy.md`
- `2026-08-27-ssrf-dns-resolution.md`
- `2026-08-20-universal-extract-feed-batches.md`
- `2026-08-20-process-feed-batches.md`
- `2026-08-19-static-article-extraction.md`

## Recurring Patterns

- None found. This round is release/ops tooling rather than the HTTP-boundary work that has recurred in prior entries. Governing-document drift did not recur: testing-strategy and contributor-flow were updated in the same change.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.5   |

## Suggestions

No significant improvement opportunities found (no dimension scored above 0.6).

## Changes Made

- None (no accepted suggestions).

## Notes

- The live runner cannot execute until the workflow exists on `main`, so operational activation is deferred to a one-time post-merge run; this is inherent to GitHub manual dispatch, not a code defect.
- Two-axis code review found no blockers; three in-scope partial items (HOME isolation, per-attempt diagnostics, artifact retention) were fixed in a follow-up commit before review completion.

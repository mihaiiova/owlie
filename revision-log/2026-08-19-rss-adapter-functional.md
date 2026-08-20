# Review: RSS adapter functional (spec #20)

**Date:** 2026-08-19
**Session:** Implemented the safe HTTP fetch primitive in `@owlieio/core` and the
RSS adapter's `list`/`extract`, then ran the two-axis review (Standards + Spec),
fixed the redirect-cap off-by-one, wrapped `resolve` URL normalization in a
typed error, and closed two coverage gaps.

## History Checked

- No prior revision logs

## Recurring Patterns

- None found

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.2   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.3   |

## Suggestions

| #   | Category | Suggestion | Score | Accepted? |
| --- | -------- | ---------- | ----- | --------- |
|     |          |            |       |           |

No significant improvement opportunities found.

## Changes Made

- None (no suggestion crossed the 0.6 threshold)

## Notes

- Two review findings were real and fixed: the redirect cap was off-by-one
  (`redirects + 1 >= maxRedirects` rejected one redirect early), and
  `RssAdapter.resolve` leaked a raw `TypeError` for a malformed URL paired with
  an `rss` hint.
- The `check:deps` gate caught a missing `@owlieio/testing` devDependency
  (documented test-only exception in AGENTS.md §6); no process change needed.
- Host machine load caused transient `vitest-worker` timeouts on two runs;
  environmental, not a workflow signal.
- SSRF hostname-resolution gap is a known limitation, already captured as idea
  #22 and documented in ADR 0010.

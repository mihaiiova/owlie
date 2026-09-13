# Review: spec-review of #74 (generic podcast episode-page resolution)

**Date:** 2026-09-12
**Session:** Reviewed `spec/74-podcast-episode-resolver-generic`, then resolved the
article-shadowing P0 (fallback-to-article dispatch), oEmbed type filter, MIME
validation, malformed-signal tolerance, JSON-LD page-URL guard, cancellation
threading through `resolveItem`, and the missing changeset.

## History Checked

- 2026-09-05-openai-provider-explicit-selection.md
- 2026-08-28-release-validation-live-e2e.md
- 2026-08-27-safe-http-credential-policy.md
- 2026-08-27-ssrf-dns-resolution.md
- 2026-08-20-process-feed-batches.md

## Recurring Patterns

- None found. The article-shadowing regression is new to this round.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.2   |
| Missing capability | 0.0   |
| Knowledge gap      | 0.4   |
| Fragility          | 0.5   |

## Suggestions

| #   | Category | Suggestion                              | Score | Accepted? |
| --- | -------- | --------------------------------------- | ----- | --------- |
| —   | —        | No suggestion crossed the 0.6 threshold | —     | —         |

## Changes Made

- Regression tests added in-session for the dispatch fallback (`extractWithFallback`
  unit tests in `apps/cli/test/dispatch.test.ts` and a command-level fallback test
  in `apps/cli/test/extract-feed.test.ts`), plus resolver tests for the JSON-LD
  page-URL guard, oEmbed `type` filter, and non-HTML content-type deferral.

## Notes

- Fragility (0.5): the recognize-predicate overlap between the generic episode
  resolver and the article adapter would have shipped as a silent article-extraction
  regression had review not caught it; now covered by regression tests and docs
  (`docs/cli-contract.md`, ADR 0019).
- Knowledge gap (0.4): issue #74 specified "recognize all safe non-media URLs"
  while also requiring "no fall-through to article", which collides with the
  documented v0.1 article path — resolved with the user as a spec design decision.

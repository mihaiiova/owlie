# Review: spec-review of #90 (consolidate content-type and output-format vocabulary)

**Date:** 2026-09-15
**Session:** Reviewed `spec/90-consolidate-content-type-and-format-vocabulary`. The
round added core `media-type.ts`, migrated five package-local classifiers to it,
removed `HttpFetcher.fetchText`, and split `ProcessResultFormat` from the reserved
`OutputFormat`. During review, two spec-required regression tests were restored:
RSS empty/whitespace declared content types, and missing-declaration rejection for
`owlie setup` and the generic episode-page resolver.

## History Checked

- 2026-09-13-spec-review-75-apple-podcasts.md
- 2026-09-12-spec-review-74-generic-episode-page.md
- 2026-09-05-openai-provider-explicit-selection.md
- 2026-08-28-release-validation-live-e2e.md
- 2026-08-27-safe-http-credential-policy.md

## Recurring Patterns

- None found. The changeset (a prior recurring gap) was added proactively this
  round; content-type validation is the subject of the change, not a gap in it.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.2   |
| Repetition         | 0.3   |
| Missing capability | 0.0   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.4   |

## Suggestions

| #   | Category | Suggestion                              | Score | Accepted? |
| --- | -------- | --------------------------------------- | ----- | --------- |
| —   | —        | No suggestion crossed the 0.6 threshold | —     | —         |

## Changes Made

- Added regression tests for RSS empty/whitespace declared content types
  (`packages/adapter-rss/test/rss-adapter.test.ts`), and missing-declaration
  rejection in `apps/cli/test/setup.test.ts` and
  `packages/adapter-podcast/test/page-resolver.test.ts`.

## Notes

- Fragility (0.4): deleting `feed.test.ts`'s `isFeedMediaType` block and
  `output.test.ts` dropped edge-case coverage that the spec's testing decisions
  required; the review restored it. Below threshold, but a reminder to migrate a
  removed helper's behavioral coverage to its replacement seam.
- Standards review noted the RSS `assertFeedMediaType` "declared" test hand-rolls
  the missing/empty check; left as-is because adopting a `mediaTypeOf`-based check
  would change the parameter-only `; charset=utf-8` edge case from reject to
  accept, violating "no observable behavior change".

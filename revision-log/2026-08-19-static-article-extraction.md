# Review: Static article extraction (spec #24)

**Date:** 2026-08-19
**Session:** Added the safe static `article` adapter and enriched HTTP response
seam, then completed a two-axis review and fixed streaming-body cancellation,
entity decoding, fixture coverage, and the core safe-HTTP rule wording.

## History Checked

- 2026-08-19-rss-adapter-functional.md

## Recurring Patterns

- None found. The prior session's safe-fetch review found a redirect-boundary
  defect; this session independently found the timeout boundary during body
  streaming. Both are HTTP-boundary correctness findings, but do not establish
  a repeated workflow problem.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.5   |
| Repetition         | 0.3   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.5   |
| Fragility          | 0.5   |

## Suggestions

| #   | Category | Suggestion | Score | Accepted? |
| --- | -------- | ---------- | ----- | --------- |
|     |          |            |       |           |

No significant improvement opportunities found.

## Changes Made

- Added regression coverage for an HTTP response that stalls after headers and
  ensured the core timeout/abort signal remains active while reading the body.
- Added article plain-text entity decoding and coverage for missing content
  types and malformed static HTML.
- Clarified the `packages/core/AGENTS.md` safe-HTTP exception to its otherwise
  pure-core rule.

## Notes

- The global `pnpm check` formatting gate remains blocked by pre-existing,
  unrelated formatting failures in `docs/research/article-extraction-libraries.md`
  and `revision-log/2026-08-19-rss-adapter-functional.md`. All changed files
  pass Prettier, and the remaining lint, typecheck, test, dependency, build,
  export, and smoke gates passed.
- The untracked `CONTEXT.md` and `docs/research/` predated this branch and were
  preserved without modification.

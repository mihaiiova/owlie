# Review: Process feed batches (spec #27)

**Date:** 2026-08-20
**Session:** Added `owlie process FEED_URL --each` collection processing (JSONL
per-item records), extracted the shared `extractLinkedItem` seam, then ran the
two-axis review and fixed the stale AGENTS.md §2/§3 + ADR 0005 status, a
piped-stdin test gap, and the duplicated adapter-wiring inconsistency.

## History Checked

- 2026-08-20-universal-extract-feed-batches.md
- 2026-08-19-rss-cli-listing.md
- 2026-08-19-rss-adapter-functional.md
- 2026-08-19-static-article-extraction.md

## Recurring Patterns

- Confirmed, fourth occurrence: a stale governing doc contradicting the change,
  caught only at review time. #24 (core `AGENTS.md` safe-HTTP rule), #25
  (ADR 0005 "no list" clause), #26 (root `AGENTS.md` §2/§3), and now #27
  (`AGENTS.md` §2/§3 + ADR 0005 still listing `process --each` as a v0.1
  non-goal). Notably, the #26 mitigation (strengthening §14 to require
  governing-status/ADR reconciliation "in the same change") did not prevent
  this recurrence, because §14 was not applied at implementation time.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.4   |
| Repetition         | 0.7   |
| Missing capability | 0.5   |
| Knowledge gap      | 0.5   |
| Fragility          | 0.5   |

## Suggestions

| #   | Category      | Suggestion                                                                                                                                                  | Score | Accepted? |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | documentation | Add governing-doc reconciliation to the §19 "Definition of done" gate (cross-referencing §14), so it is checked at implementation time, not only at review. | 0.7   | ✅        |

## Changes Made

- Amended `AGENTS.md` §19 "Definition of done" to require documentation be
  updated _and internally consistent_, explicitly naming the §2/§3 governing
  status and any ADR whose decisions the change reverses (§14).
- Fixed the review findings: updated `AGENTS.md` §2/§3 and ADR 0005 for
  `process --each`; corrected the piped-stdin rejection test to actually pass a
  feed URL; extracted `defaultItemAdapters` into `registry.ts` and added a
  `readConfig` seam to `ProcessDeps` (dedup + testability).

## Notes

- Spec axis: all four user stories and all implementation/testing decisions
  satisfied; 0 wrong-looking implementations; the only partial was file
  placement of the pipeline test, covered by `process-feed.test.ts`'s
  end-to-end `RssAdapter` case.
- `pnpm check` passes (317 tests) after the fixes.

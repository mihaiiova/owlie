# Review: RSS/Atom listing in the CLI (spec #25)

**Date:** 2026-08-19
**Session:** Added `owlie list FEED_URL [--limit N] [--json]`, then ran the
two-axis review and fixed strict `--limit` parsing plus an ADR-0005
documentation-consistency gap.

## History Checked

- 2026-08-19-static-article-extraction.md
- 2026-08-19-rss-adapter-functional.md

## Recurring Patterns

- Mild: documentation-consistency gaps (a stale governing doc contradicting a
  change) surfaced at review in both #24 (core AGENTS.md safe-HTTP rule) and
  #25 (ADR 0005 "no list" clause). Not yet a strong enough signal for a
  process change; AGENTS.md §14 already mandates docs/ADR updates.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.2   |
| Knowledge gap      | 0.5   |
| Fragility          | 0.4   |

## Suggestions

| #   | Category | Suggestion | Score | Accepted? |
| --- | -------- | ---------- | ----- | --------- |
|     |          |            |       |           |

No significant improvement opportunities found.

## Changes Made

- Tightened `parseListLimit` to accept only decimal positive-integer strings
  (rejecting `1e2`, `0x10`, `2.5`, etc.) before delegating to core `resolveLimit`.
- Added ADR 0012 for bounded RSS/Atom CLI listing and annotated ADR 0005's
  status and deferred-capability clauses as superseded in part.

## Notes

- The Spec axis marked `--json` "item metadata" as partial because item
  summaries omit the `ContentItem.metadata` map; this is deliberate: that map
  carries raw entry HTML (`content`/`description`), which must never reach
  stdout. The safe fields (id, URL, title, description, date, author) are all
  present.
- Feed-title propagation from `RssAdapter.list` and HTML-stripping of item
  titles are pre-existing adapter behaviors, out of scope for this spec.
- `pnpm check` passes (286 tests) after the fixes.

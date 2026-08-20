# Review: Universal extract and feed batches (spec #26)

**Date:** 2026-08-20
**Session:** Made `owlie extract` universal (registry dispatch of direct URLs to
YouTube/article, and bounded RSS/Atom feed batch extraction into one JSON
envelope), then ran the two-axis review and fixed stale root `AGENTS.md`
§2/§3 status/scope text plus completed the half-registered `adapter-article`
wiring (tsconfig paths, vitest alias, CLI devDependencies, changeset ignore).

## History Checked

- 2026-08-19-rss-cli-listing.md
- 2026-08-19-rss-adapter-functional.md
- 2026-08-19-static-article-extraction.md

## Recurring Patterns

- Confirmed: a stale governing doc contradicting the change, caught only at
  review time. Prior occurrences — #24 (core `AGENTS.md` safe-HTTP rule) and
  #25 (ADR 0005 "no list" clause), both noted in
  `2026-08-19-rss-cli-listing.md`. This session it recurred a third time: root
  `AGENTS.md` §2 ("Only --help/--version/doctor are functional") and §3
  ("RSS/Atom", "generic webpage extraction", "collection listing" as v0.1
  non-goals) all contradicted the shipped article+feed behavior.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.4   |
| Repetition         | 0.6   |
| Missing capability | 0.4   |
| Knowledge gap      | 0.5   |
| Fragility          | 0.5   |

## Suggestions

| #   | Category      | Suggestion                                                                                                                                                                                  | Score | Accepted? |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | documentation | Reconcile governing docs at implementation time, not review time: extend AGENTS.md §14 to require updating §2/§3 and superseding ADRs when a change makes a deferred capability functional. | 0.6   | ✅        |

## Changes Made

- Strengthened `AGENTS.md` §14 to require updating the root file's §2 status
  and §3 scope/non-goal lists (and superseding affected ADRs) in the same
  change when a deferred capability becomes functional.
- Updated `AGENTS.md` §2/§3 to reflect the now-functional `extract` (YouTube,
  article, feed batches), `list`, and `process`, and removed RSS/Atom, generic
  webpage extraction, and collection listing from the v0.1 non-goals.

## Notes

- The Spec axis found zero missing/partial requirements, zero scope creep, and
  zero wrong-looking implementations; all five public seams and all four user
  stories pass. The only residual risk is inherited (suffix-based feed
  recognition from `RssAdapter`), not a spec violation.
- Standards judgements (data clump in the private extraction helpers, the two
  near-identical `ProgressSink` literals, the `@deprecated` `parseListLimit`
  delegator) were left as-is: fixing them would add indirection without
  improving behavior.
- `adapter-article` had been added by #24 but only half-registered for the CLI;
  the missing tsconfig/vitest/devDependencies/changeset wiring was completed
  here. `pnpm check` passes (302 tests).

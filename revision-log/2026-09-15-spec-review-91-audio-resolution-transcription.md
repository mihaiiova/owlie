# Review: spec-review of #91 (split audio resolution from transcription)

**Date:** 2026-09-15
**Session:** Implemented `spec/91-audio-resolution-and-transcription` — a two-stage
audio boundary (`owlie resolve` + resolver-selection flags on `extract`), a single
resolver registry, and chunked long-form transcription in the generic whisper
pipeline. Review (Standards + Spec sub-agents) surfaced two blockers, both fixed:
the resolver registry was not actually the sole registration point
(`defaultItemAdapters` still hardcoded the three resolvers), and `bin.ts` did not
wire the abort signal for the new `resolve` command. Also removed the unused
`resolverFlags()` helper.

## History Checked

- 2026-09-15-spec-review-90-media-type-output-vocabulary.md
- 2026-09-13-spec-review-75-apple-podcasts.md
- 2026-09-12-spec-review-74-generic-episode-page.md
- 2026-09-05-openai-provider-explicit-selection.md
- 2026-08-28-release-validation-live-e2e.md

## Recurring Patterns

- None found.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.0   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.4   |

## Suggestions

| #   | Category | Suggestion                              | Score | Accepted? |
| --- | -------- | --------------------------------------- | ----- | --------- |
| —   | —        | No suggestion crossed the 0.6 threshold | —     | —         |

## Changes Made

- None (no accepted suggestions).

## Notes

- The two review blockers were implementation gaps against the spec's own
  invariants (ID2 "registry is the sole place", ID8 "thread AbortSignal"), not a
  process or tooling gap; both are now fixed and covered by `pnpm check`.

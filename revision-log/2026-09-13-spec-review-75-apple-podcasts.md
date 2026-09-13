# Review: spec-review of #75 (Apple Podcasts episode resolution)

**Date:** 2026-09-13
**Session:** Reviewed `spec/75-apple-podcasts-episode-audio-resolution`, then
resolved an AGENTS.md self-contradiction (provider-specific lookup still listed
deferred), four stale dependency-rule docs, the missing changeset, skipped
content-type validation, and the RSS fallback matching on the wrong identifier
(`itunes:episode` number vs Apple trackId → switched to the lookup `episodeGuid`).

## History Checked

- 2026-09-12-spec-review-74-generic-episode-page.md
- 2026-09-05-openai-provider-explicit-selection.md
- 2026-08-28-release-validation-live-e2e.md
- 2026-08-27-ssrf-dns-resolution.md
- 2026-08-27-safe-http-credential-policy.md

## Recurring Patterns

- **Missing changeset** — #74's log ("resolved … the missing changeset") and #75
  both shipped user-facing spec work without a `.changeset/*.md`, tripping the
  CI changeset-presence gate (a separate workflow from `pnpm check`).
- **New resolvers skip content-type validation** — #74's log ("MIME validation")
  and #75's `ApplePodcastsResolver` both needed the `docs/security-model.md`
  declared-content-type check added during review.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.6   |
| Knowledge gap      | 0.4   |
| Fragility          | 0.6   |

## Suggestions

| #   | Category      | Suggestion                                                                                                                                                 | Score | Accepted? |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | documentation | Document the changeset requirement and content-type validation in `AGENTS.md` §19 and `CONTRIBUTING.md` so future spec work catches both before review/CI. | 0.6   | ✅        |

## Changes Made

- `AGENTS.md` §19 definition-of-done now requires a changeset (or `no-changeset`
  label) for user-facing changes and content-type validation before parsing
  remote bodies.
- `CONTRIBUTING.md` development-workflow step 3 now calls out content-type
  validation; the existing step 6 already covers the changeset requirement.

## Notes

- Fragility (0.6) and missing capability (0.6) share one root cause: the
  changeset-presence check lives only in CI, not in `pnpm check`, so spec
  branches reach review without it. The user chose to document the requirement
  rather than fold the check into the local gate.
- Knowledge gap (0.4, below threshold): the spec/ADR said "matching by episode
  id" without naming the lookup `episodeGuid` field as the RSS `<guid>` bridge;
  the implementation matched the episode number instead. Corrected in-code.

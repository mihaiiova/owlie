# Review: spec-review of #112 (batch progress spinner)

**Date:** 2026-09-22
**Session:** Reviewed `spec/112-fix-batch-progress-spinner` against `development`. The batch sinks now label extraction with a bounded position, forward message-bearing progress events, and set the LLM wait notice before each batch processor call. Regression tests cover order, forwarding, and non-TTY output. `pnpm check` passes.

## History Checked

- 2026-09-21-spec-review-110-bounded-feed-discovery.md
- 2026-09-21-spec-review-109-provenance-capabilities.md
- 2026-09-18-spec-review-108-invocation-controls.md
- 2026-09-18-spec-review-107-versioned-json-protocol.md
- 2026-09-18-spec-review-106-hosted-cli-mode.md

## Recurring Patterns

- The configured DeepSeek reviewer model was unavailable again, matching
  `2026-09-21-spec-review-110-bounded-feed-discovery.md` and
  `2026-09-21-spec-review-109-provenance-capabilities.md`. Manual fallback
  inspection covered both Standards and Spec axes.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.4   |
| Repetition         | 0.7   |
| Missing capability | 0.2   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.8   |

## Suggestions

| #   | Category     | Suggestion                                                                                                                                                                                                               | Score | Accepted? |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | --------- |
| 1   | organization | Restore the configured DeepSeek reviewer model or deliberately update the project override. This is the existing pending suggestion from the two prior reviews; it was not reopened during this release-focused session. | 0.8   | Pending   |

## Changes Made

- Corrected the release-cycle version assertions in CLI tests and smoke checks so the intended `0.5.1-dev` version validates.
- Formatted the three prior tracked revision logs that blocked `pnpm check` after the unrelated ignore rule was removed.

## Notes

- The first verification run exposed numeric-only version assertions and the smoke regex; all now accept valid prerelease suffixes.
- The reviewer fan-out could not start because `deepseek/deepseek-v4-flash` is absent from the active model registry. No reviewer output was available; the final review used direct source/spec inspection.

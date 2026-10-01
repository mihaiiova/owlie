# Review: Codex review of release PR #125

**Date:** 2026-10-01
**Session:** Triaged the five P2 suggestions from the automated Codex review of `release/0.6.0` (it reviewed the full diff against `main`, i.e. everything since 0.5.1). All five were verified against the code. Three were fixed on `fix/codex-review-125`, test-first; two local-only items were filed as #126. `pnpm check` passes (1047 tests).

## Triage

| #   | Finding                                            | Verified                                                                                                              | Action                                                                                       |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Over-limit chunk does not exhaust the byte budget  | Yes: `consume()` threw without changing `remaining`; feed probes and batch items catch `ExtractionError` and continue | Fixed: budget set to 0 on overflow; existing test asserted the old behaviour and was updated |
| 2   | Episode-page nested fetches swallow cancellation   | Yes: `catch {}` in `resolveOembedAudio` and `resolveFeedAudio`                                                        | Fixed: rethrow on `CancelledError` or an aborted signal                                      |
| 3   | `setup` prompts ignore the invocation signal       | Yes; local only (`setup` is rejected in hosted mode)                                                                  | Filed #126                                                                                   |
| 4   | `auth list` ignores `--env-file`                   | Yes: passed `{}`                                                                                                      | Fixed                                                                                        |
| 5   | `auth` storage failures escape as unversioned text | Yes; local only (`auth` is rejected in hosted mode)                                                                   | Filed #126                                                                                   |

## Changes Made

- Fixes 1, 2, 4 with tests; a patch changeset.

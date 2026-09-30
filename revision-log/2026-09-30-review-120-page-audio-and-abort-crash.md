# Review: fix #120 (page video treated as podcast audio; abort crashes the process)

**Date:** 2026-09-30
**Session:** Reviewed `fix/120-page-video-and-deadline-crash` against `development`. Episode-page resolution now accepts only audio signals, the feed fallback uses only the entry matching the page, and aborted body reads no longer leak an unhandled `AbortError`. `pnpm check` passes (1031 tests).

## History Checked

- 2026-09-30-review-121-atom-href-decoding.md
- 2026-09-30-review-119-discovered-feed-urls.md
- 2026-09-16-spec-review-77-direct-media-limits.md

## Root Causes

- **Crash.** `DefaultHttpFetcher` cancelled the body reader with `void reader.cancel()` when its signal aborted. Real `fetch` errors the body stream on abort, so `cancel()` rejects with the same `AbortError`, and `void` left that rejection unhandled. Node exits on unhandled rejections. Reproduced in a core test with a body that errors like real fetch (fails without the fix, passes with it). Fixed in both `readBody` and `writeBodyToFile`, so it covers every page, feed, and media fetch, not only podcast media.
- **Video as audio.** `audioUrlFromHtml` took the first `<source src>` anywhere on the page, including inside `<video>`. `resolveEnclosure` accepted any enclosure type.
- **Unrelated episode.** The feed fallback took the first enclosure in the site's whole feed for any page, so a page on a site whose feed carries episodes resolved to the latest episode.

## Verification

| Case                                                  | Before                                      | After                                                         |
| ----------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `extract https://simonwillison.net/` (original repro) | Downloads a `.mp4`, crashes at the deadline | Video ignored; no crash (see Findings for the `<audio>` clip) |
| Real NPR episode MP3 with `--timeout-ms 3000`         | (crash path)                                | Exit 130 with `kind: "cancelled"` record                      |

## Findings

- The fix follows ADR 0019's intent ("`<audio>` or `<source>`", "enclosure") by restricting signals to audio; ADR 0019 is annotated.
- The feed fallback now parses feeds with `@owlieio/adapter-rss` (safe XML, decoded, typed enclosures from #116) instead of a regex over feed XML. The documented dependency exception in `AGENTS.md` and `architecture.md` is widened from "the Apple Podcasts enclosure" to "the matching episode's enclosure from a feed".
- Open design question, not changed here: the re-run homepage has a real `<audio src="….wav">` clip, which is a valid audio signal under ADR 0019, so the page is still treated as an episode and sent to local Whisper. Episode-page resolution runs before article classification (#118), so any article with an embedded audio player ("listen to this article", a short clip) is transcribed instead of extracted as text. Raised with the owner for a decision.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.4   |
| Fragility          | 0.5   |

## Suggestions

| #   | Category   | Suggestion                                                                                                 | Score | Accepted? |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | capability | Decide precedence between page audio and article declarations (see Findings).                              | 0.8   | Pending   |
| 2   | testing    | Add a lint rule or review check against `void` on promises that can reject (`no-floating-promises` style). | 0.5   | Pending   |

## Changes Made

- None beyond the fix commit.

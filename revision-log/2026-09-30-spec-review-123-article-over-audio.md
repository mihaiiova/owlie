# Review: spec-review of #123 (declared article pages win over embedded audio)

**Date:** 2026-09-30
**Session:** Reviewed `spec/123-article-over-audio` against `development`. The episode-page resolver now distinguishes strong and weak audio signals and defers declared articles with only weak signals to the article adapter; `--podcast-page` stays authoritative. `pnpm check` passes (1044 tests).

## History Checked

- 2026-09-30-review-120-page-audio-and-abort-crash.md
- 2026-09-30-spec-review-118-extract-article-pages.md

## Spec Coverage

| Decision                                                  | Status                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Strong signals always resolve                             | Done (JSON-LD audio types; oEmbed only when `type: "audio"` or an audio media URL)               |
| Weak signals only without an article declaration          | Done                                                                                             |
| Deferral carries the fetched page; no second fetch        | Done (CLI test counts one fetch)                                                                 |
| Shared declaration check in core                          | Done (`declaredArticleSignal` in `@owlieio/core`; `adapter-article` re-exports it)               |
| Undeclared pages unchanged                                | Done (regression test)                                                                           |
| `--podcast-page` authoritative (`extract` and `resolve`)  | Done (`PodcastResolveOptions.authoritative`, set by `resolvePodcastAudio` on explicit selection) |
| No `ARTICLE_FALLBACK` on the deferred article             | Done                                                                                             |
| ADR, `cli-contract.md`, adapter README, changeset (minor) | Done (ADR 0037; ADR 0019 annotated)                                                              |

## Live Verification

- `https://simonwillison.net/2026/Sep/23/gemini-tts-playground/` declares `og:type` article and embeds `<audio>` with a `.wav` clip. `extract` returns article text (adapter `article`, no warnings); `resolve --podcast-page` returns the `.wav`.
- `https://simonwillison.net/` declares no `og:type` and shows the same clip in its post list. Per the spec's "undeclared pages keep today's behaviour", it still resolves the clip as an episode (and then needs local Whisper). See Findings.

## Findings

- A `video`-typed oEmbed with a video URL was still accepted as episode audio after #120. It is now ignored unless its media URL is audio, as the spec's strong-signal definition requires.
- Residual behaviour for undeclared pages: a homepage or listing page with no `og:type`/JSON-LD that shows an `<audio>` player from one of its posts is still treated as an episode. This is the agreed rule (it protects episode pages whose only signal is a player), but homepages are a common input. A possible follow-up is to treat weak signals on undeclared pages as episodes only when the audio is the page's primary content (for example a single player and no feed of multiple entries), or to require an explicit `--podcast-page` for weak-only pages. Left for the owner to decide.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.2   |
| Repetition         | 0.3   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.4   |

## Suggestions

| #   | Category   | Suggestion                                                                         | Score | Accepted? |
| --- | ---------- | ---------------------------------------------------------------------------------- | ----- | --------- |
| 1   | capability | Decide how weak audio signals should apply to undeclared homepages (see Findings). | 0.6   | Pending   |

## Changes Made

- None beyond the implementation commit.

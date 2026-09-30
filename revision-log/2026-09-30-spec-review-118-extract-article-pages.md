# Review: spec-review of #118 (extract article pages directly)

**Date:** 2026-09-30
**Session:** Reviewed `spec/118-extract-article-pages` against `development`. `owlie extract <page URL>` now classifies the page from one fetch and returns an article page as a single document; other pages go to feed discovery with the same response. `--article`/`--feed` force either path. `pnpm check` passes (962 tests). A live check against a real blog post returned a single article document with no warnings, where `development` returned the site's feed batch.

## History Checked

- 2026-09-30-spec-review-117-general-purpose-positioning.md
- 2026-09-22-spec-review-112-batch-progress.md
- 2026-09-21-spec-review-110-bounded-feed-discovery.md

## Spec Coverage

| Decision                                                           | Status                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Classification by og:type, JSON-LD (incl. `@graph`), readable body | Done (`ArticleAdapter.classify`, `declaredArticleSignal`, `MIN_READABLE_ARTICLE_CHARS` = 500) |
| Non-article pages keep ADR 0033 discovery                          | Done (`discoverFromResponse`; ranking and probes unchanged)                                   |
| Neither → one combined error                                       | Done (`CONFIGURATION_ERROR`, "no article content or RSS/Atom feed found")                     |
| No double fetch                                                    | Done (reuses the episode-page resolver's deferred response; tested by fetch counts)           |
| `--article` / `--feed`, conflicts, `--article` on YouTube/feed     | Done                                                                                          |
| `ARTICLE_FALLBACK` semantics                                       | Done, refined (see Findings)                                                                  |
| `process URL` agrees with `extract`                                | Done (classification in `extractWithFallback`)                                                |
| Docs, ADR 0035, changeset (minor)                                  | Done; #117's "not available yet" notes removed                                                |
| Live suite gains a real article URL                                | Done in the release e2e (`extract article` scenario on the controlled corpus)                 |

## Findings

- The spec said to emit `ARTICLE_FALLBACK` "only when the article path came from the podcast episode-page deferral". The generic episode-page resolver recognizes every safe page, so that rule would have warned on every article. Implemented the spec's other sentence instead: no warning for a page classified as an article; the warning stays for article text taken from a page that is not one (`process URL` and linked items). Recorded in ADR 0035.
- Undeclared pages need 500 readable characters. A page with a declared non-article `og:type` (such as `website`) is never classified by its body, which keeps homepages on the discovery path.
- The release e2e scenario "extract discovered feed" only passed on the corpus page because that page is short and undeclared. It now uses `--feed`, and a new `extract article` scenario uses `--article`, so neither depends on classification.
- `--article`/`--feed` are ignored on commands other than `extract`, matching the existing resolver-flag behaviour. Not changed.
- Live checks found two pre-existing bugs on `development`, filed separately: #119 (a discovered feed at a non-feed-shaped URL is rejected by list/extract) and #120 (a page video treated as podcast audio; a deadline `AbortError` crashes the process).

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.2   |
| Missing capability | 0.4   |
| Knowledge gap      | 0.4   |
| Fragility          | 0.4   |

## Suggestions

| #   | Category   | Suggestion                                                                                     | Score | Accepted? |
| --- | ---------- | ---------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | capability | Fix #119 before owlie-app #220; many real feeds live at non-feed-shaped URLs.                  | 0.8   | Pending   |
| 2   | capability | Fix #120; an ordinary homepage can currently start a media download and crash on the deadline. | 0.7   | Pending   |
| 3   | docs       | Consider rejecting page/resolver flags on commands that ignore them, as a usage error.         | 0.3   | Pending   |

## Changes Made

- None beyond the implementation commit.

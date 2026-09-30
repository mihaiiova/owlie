# Review: fix #119 (feeds at URLs that do not look like feeds)

**Date:** 2026-09-30
**Session:** Reviewed `fix/119-discovered-feed-urls` against `development`. A discovered feed is now listed with a `feed` hint instead of being re-recognized by URL suffix, and a supplied URL that serves a feed is its own discovery result. `pnpm check` passes (1016 tests).

## History Checked

- 2026-09-30-spec-review-116-feed-listing-metadata.md
- 2026-09-30-spec-review-118-extract-article-pages.md
- 2026-09-21-spec-review-110-bounded-feed-discovery.md

## Verification

| Case                                                              | `development`                                   | This branch                     |
| ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| `list https://simonwillison.net/` (discovers `/atom/everything/`) | `CONFIGURATION_ERROR` not a recognized feed URL | Lists the feed                  |
| `list https://simonwillison.net/atom/everything/`                 | Fails                                           | Lists the feed                  |
| `list https://hnrss.org/frontpage` (direct, no feed suffix)       | `no RSS/Atom feed discoverable`                 | Lists the feed                  |
| `extract https://simonwillison.net/ --feed --limit 1`             | Fails                                           | Batch with one article document |

## Findings

- The issue suggested carrying the discovered collection through, or using the adapter's existing hint support. The hint was the smaller change: `feedLocator(url)` in `apps/cli/src/feed.ts` is used by all three listing call sites (`list`, `extract` feed batches, `process --each`), which only ever see recognized, discovered, or self-serving feeds.
- The issue listed `/?feed=rss2` and similar paths as common. A user supplying such a URL directly also failed, because discovery only accepted HTML pages. Discovery now returns the supplied response itself when it has a feed media type and parses as RSS/Atom (a generic `application/xml` sitemap is rejected). This is covered in the same change.
- A live check on `https://feeds.megaphone.fm/vergecast` failed with `response body exceeded 5242880 bytes`: large podcast feeds exceed the default 5 MiB response cap. Unrelated to this fix; filed separately.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.2   |
| Repetition         | 0.3   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.3   |

## Suggestions

| #   | Category   | Suggestion                                                                                  | Score | Accepted? |
| --- | ---------- | ------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | capability | Raise or make configurable the per-response cap for feeds; real podcast feeds exceed 5 MiB. | 0.6   | Pending   |

## Changes Made

- None beyond the fix commit.

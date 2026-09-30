# Review: spec-review of #115 (YouTube embed and /v/ URLs)

**Date:** 2026-09-30
**Session:** Reviewed `spec/115-youtube-embed-urls` against `development`. `/embed/<id>` and `/v/<id>` now resolve to the canonical `watch?v=<id>` URL and `youtube:video:<id>` identity; `/live/` and `/shorts/` fail with `VALIDATION_ERROR`. `pnpm check` passes (999 tests). Live check with the built binary: an `/embed/<id>?start=5` URL extracted the transcript with the watch-URL identity, and a `/live/` URL returned the validation error.

## History Checked

- 2026-09-30-spec-review-114-extraction-proxy.md
- 2026-09-30-spec-review-118-extract-article-pages.md

## Spec Coverage

| Decision                                                | Status                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/embed/` and `/v/` on recognized hosts, extras ignored | Done                                                                                          |
| Same canonical URL and identity as `watch?v=`           | Done (tested across watch, youtu.be, embed, `/v/`, `m.` embed)                                |
| `/live/` and `/shorts/` → `VALIDATION_ERROR`            | Done (exit code 2, per the documented error taxonomy)                                         |
| No article fallback for YouTube hosts                   | Confirmed: YouTube errors are not deferrals; CLI test proves later adapters are never reached |
| Playlist handling unchanged                             | Confirmed                                                                                     |
| Docs and changeset                                      | Done (adapter README, `cli-contract.md`, minor changeset)                                     |

## Findings

- The spec named `AGENTS.md`/README for the URL list; the list actually lives in `packages/adapter-youtube/README.md`, which was updated instead, along with `cli-contract.md`.
- The live check surfaced a stale message from before #114: a blocked transcript request told users to run `owlie setup`, which hosted mode rejects. It now names `OWLIE_PROXY_URL` and the Webshare variables first.
- One `watch?v=` request in the live check was blocked by YouTube (this machine's IP is intermittently rate-limited); the following `/embed/` request succeeded. Unrelated to this change.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.2   |
| Repetition         | 0.2   |
| Missing capability | 0.1   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.2   |

## Suggestions

| #   | Category | Suggestion                                                                           | Score | Accepted? |
| --- | -------- | ------------------------------------------------------------------------------------ | ----- | --------- |
| 1   | docs     | `youtube-nocookie.com/embed/` is not a recognized host; add it if consumers need it. | 0.3   | Pending   |

## Changes Made

- Updated the blocked-request message to name the proxy environment variables.

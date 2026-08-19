# ADR 0006 — Pure-JS YouTube transcripts (no Python)

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

v0.1 originally extracted YouTube transcripts by shelling out to a bundled
Python helper (`youtube-transcript-api` + `yt-dlp`), mirroring
`owlie-app/ingestion_service`. This forced users to install `python3` plus two
pip packages, and `yt-dlp` was used only to fetch the optional video title.

## Decision

- Replace the Python helper with the pure-JS
  [`@hallelx/youtube-transcript`](https://www.npmjs.com/package/@hallelx/youtube-transcript)
  library (a faithful TypeScript port of `youtube-transcript-api`, same
  `youtubei/v1/player` endpoint).
- Drop the video title and `yt-dlp` entirely.
- Preserve the transcript selection policy (manual → generated, with a
  configurable language priority list defaulting to `['en']`, and a lenient
  fallback to any language) and add a `--language` CLI flag.
- Remove the Python runtime dependency surface (helper, subprocess runner,
  runtime detection, `doctor` Python reporting).

## Consequences

- `owlie extract` requires no Python or pip packages.
- The published `owlie` package no longer ships a `.py` helper; the transcript
  library is a runtime dependency (externalized, like the AI SDK).
- `owlie doctor` no longer reports Python/`youtube-transcript-api`/`yt-dlp`.
- Supersedes the transcript mechanism described in ADR 0005.

# ADR 0018 — Local direct-media podcast transcription

- **Status:** Accepted (episode-page deferral superseded by [ADR 0019](0019-generic-podcast-episode-page-resolution.md))
- **Date:** 2026-09-06

## Context

Owlie can extract textual sources but needs a local-first path for a direct
podcast audio URL. Audio must use the same SSRF, redirect, timeout, cancellation,
and bounded-download policy as text fetches. The project must not bundle native
or Python transcription dependencies.

## Decision

- Core exposes a binary `fetchToFile` seam that retains the safe HTTP policy and
  streams bounded bytes to a caller-owned temporary file.
- `adapter-podcast` recognizes direct audio URLs and delegates resolution through
  `PodcastAudioResolver`; the foundation resolver supports only direct media.
- The adapter downloads into the cache directory, invokes an injected
  provider-neutral `Transcriber`, returns a podcast transcript document, and
  removes the temporary directory in every completion path.
- `provider-whisper` invokes ffprobe, ffmpeg, and Python/faster-whisper with
  argument arrays only. It normalizes to 16 kHz mono WAV and emits segment timing.
- `owlie setup` and `owlie doctor` detect prerequisites but never package,
  install, or download them. The persisted Whisper model is 0600 user config.

## Consequences

Direct media URLs are functional. Generic declarative server-rendered
episode-page resolution is covered by ADR 0019; provider-specific resolution,
feeds, diarization, streaming, GPU management, and Windows guarantees remain
out of scope. Users install Python 3, `faster-whisper`, ffmpeg, and ffprobe.

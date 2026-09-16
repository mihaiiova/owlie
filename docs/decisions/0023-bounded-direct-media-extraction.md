# ADR 0023 — Bounded direct-media extraction operations

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

A caller invoking `owlie extract <direct-media-url>` as a subprocess needs a
bounded operation with deterministic cancellation. Per-request HTTP timeouts
alone do not limit ffprobe, ffmpeg, or local faster-whisper, and a failed
prerequisite probe must not be reported as available.

## Decision

- `owlie extract` accepts `--timeout-ms` and `--max-media-bytes` for direct
  media. Both values are positive integers.
- `--timeout-ms` creates one abort signal for the complete extraction operation:
  resolution, download, probe, transcode, and transcription share it.
- `--max-media-bytes` is passed to the existing safe binary HTTP seam. When it
  is omitted, the adapter retains its established safe default.
- Local subprocesses explicitly terminate their active child when the shared
  signal aborts. Podcast and Whisper work directories remain cleanup boundaries
  for failure and cancellation.
- Prerequisite probes report available only when their command exits with status
  zero; Python availability is checked with `python3 -c 'import faster_whisper'`.

## Consequences

Direct-media extraction retains one result on stdout and diagnostics on stderr,
while callers can bound resource use without adding persistent jobs or host
workflow state. Model provisioning and media validity remain separate concerns.

# ADR 0025 — Packaged extractor runtime verification

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

Workspace module tests prove that each adapter and provider satisfies its
contract in isolation, but they do not prove that the _packed_ `owlie`
executable exposes the documented direct-media extractor contract when
installed and run with its external prerequisites (Python + faster-whisper,
ffmpeg, ffprobe). A future host invokes the published executable as a
subprocess and consumes exactly one JSON document and an exit status, so the
verification must target that installed-executable boundary, not the workspace
modules.

## Decision

- Add an opt-in, artifact-level verification path (`pnpm
verify:extractor-runtime`, `scripts/verify-extractor-runtime.mjs`) that
  packs and installs `owlie`, then runs the installed executable. It verifies:
  - `doctor --json` readiness;
  - the direct-media `extract --json` normalized transcript document, its
    stdout/stderr separation, and its exit code;
  - prerequisite failure guidance (a missing prerequisite reports installation
    guidance on stderr and exits 1, distinct from an extractor failure);
  - that Owlie never downloads Whisper model weights by default (a missing
    pre-provisioned model reports "never downloads model weights" guidance).
- The default mode is offline with respect to the local runtime and models: it
  replaces `ffprobe`, `ffmpeg`, and `python3` with generated command shims that
  forward into a pure, unit-tested behavior module. The only network use is
  fetching the controlled media fixture (the GitHub Pages corpus), matching the
  release E2E gate. The default test suite (`pnpm test`) remains fully offline;
  the verification is a separate, opt-in command that is not part of
  `pnpm check`.
- The controlled media fixture is a small committed WAV in `e2e/corpus/` and is
  served from the same GitHub Pages corpus as the release E2E article/feed. Its
  manifest entry and path are validated by a pure fixture helper.
- A gated container check (`--real`, plus a Dockerfile and a manual
  workflow_dispatch) runs the same installed-executable scenarios against the
  real Python + faster-whisper + ffmpeg + ffprobe runtime with a pre-provisioned
  model and `HF_HUB_OFFLINE=1`. It proves prerequisite discovery and that the
  pre-provisioned model loads from local files only. It never runs in the
  default suite or ordinary CI.
- A real local-model transcription is deliberately gated; the default shim mode
  and the default test suite never download model weights or require a real
  runtime.

## Consequences

The published CLI's direct-media extractor contract is verified at the boundary
a subprocess consumer actually uses, without weakening SSRF protection (the
controlled fixture is public, so no private-host allowance is added) and without
introducing hosted concepts or downloading model weights in the default suite.
The real-runtime check remains a manual, environment-gated operation.

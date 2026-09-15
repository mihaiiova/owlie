# ADR 0022 — Audio source resolution and transcription split, with resolver flags

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

`owlie extract` already transcribes audio for three source shapes — direct
media URLs (ADR 0018), generic server-rendered episode pages (ADR 0019), and
Apple Podcasts episodes (ADR 0020). Each is a `PodcastAudioResolver` behind the
same seam, returning a validated `{ mediaUrl, metadata }` that
`PodcastAdapter.extract` then downloads and transcribes through the shared
`WhisperLocalTranscriber` (ffprobe/ffmpeg → 16 kHz mono WAV → faster-whisper).

Two structural gaps remain:

1. **The stages are fused.** There is no way to obtain the validated media URL
   without also downloading and transcribing it. `owlie-app`'s worker wants
   exactly that intermediate URL so it can keep its own chunked transcription,
   progress events, semaphore, and timeout handling (see the repository
   boundary in `docs/architecture.md`).
2. **Resolver selection is implicit.** Dispatch picks a resolver by URL
   recognition only. Adding a new audio source today means extending the
   recognition heuristics, not adding a named, documented, forward-stable
   switch. There is no convention for how a new audio source is expressed.

Long-form audio (multi-hour podcasts) also needs chunking and progress; the
current whisper path is single-shot and reports only start/complete.

## Decision

- Split audio extraction into two named stages that stay independently
  observable and reusable:

  1. **Resolve** — find and validate a media URL. Implemented by a
     `PodcastAudioResolver`; returns an SSRF-validated (`assertSafeHttpUrl`)
     media URL plus metadata, with no download and no transcription.
  2. **Transcribe** — the generic local pipeline shared by every audio source:
     bounded download → ffprobe/ffmpeg → 16 kHz mono → faster-whisper →
     transcript. Never duplicated per source.

- Add a `resolve` command as the composability escape hatch:
  `owlie resolve URL [--<type>-<name>] [--json]` prints the validated media URL
  (plain text, or a JSON object with `--json`) and performs no transcription.
  This is what downstream consumers (notably `owlie-app`) run to obtain the
  audio URL while keeping their own transcription pipeline.

- Add explicit resolver-selection flags to `extract` with the convention
  `--<source-type>-<resolver-name>`. The existing resolvers gain
  `--podcast-media` (direct media), `--podcast-page` (generic episode page),
  and `--podcast-apple` (Apple Podcasts). A resolver flag is a boolean flag
  (like `--json`/`--each`) whose presence selects that resolver; it asserts and
  overrides URL recognition, and a flag that does not match the URL is a clear
  error rather than a silent fallback. Pure URL recognition remains the default
  when no flag is passed. `owlie extract URL --podcast-apple` runs resolve →
  download → transcribe in one shot with the selected resolver — unchanged
  end-to-end behavior, now explicit.

- Codify the extension rule: **a new audio source is a new
  `PodcastAudioResolver` implementation plus a new `--<type>-<name>` flag.** It
  reuses the generic transcription pipeline as-is — no new adapter package, no
  new `WhisperLocalTranscriber` code, and no changes to the `extract`/`resolve`
  dispatch beyond registering the resolver and its flag. Example: a
  Shopify-hosted podcast becomes `--podcast-shopify`; it never forks
  transcription.

- Scope chunked transcription (5-minute chunks, 2-second overlap, chunk-level
  progress events) into the generic transcribe stage now. It may land after the
  initial flag/`resolve` work, but it must remain an internal change to stage 2
  — invisible to resolvers and to the CLI flag surface.

- Defer local-file input (`owlie extract ./file.mp3`) and bare-file metadata
  (title/canonical-URL defaults for a local file) as an explicit follow-up;
  this decision covers only the resolve/flag split.

## Consequences

- `owlie extract` keeps its current recognition-driven default and gains
  explicit, forward-stable resolver flags. New audio sources no longer require
  recognition-heuristic surgery.
- `owlie resolve` gives downstream consumers the validated media URL without
  transcription, closing the fused-stage gap while preserving the
  "`owlie-app` runs `owlie` as a subprocess" boundary.
- The resolver seam (`PodcastAudioResolver`) remains the single extension
  point; the transcription pipeline stays provider-neutral and is never forked
  per source. `docs/adding-an-adapter.md` documents the resolver + flag
  convention so future audio sources follow it.
- Chunking and progress become an internal concern of the transcribe stage.
- Local audio files, non-podcast audio sources, and resolvers that require
  authentication or browser rendering remain out of scope.

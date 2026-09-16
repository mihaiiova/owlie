# ADR 0024 — Direct-media validation and local Whisper model policy

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

A direct-media URL's extension only identifies a candidate for the podcast
pipeline; it does not prove that its downloaded bytes are readable audio.
Likewise, allowing faster-whisper to resolve a named model from the network
makes local extraction nondeterministic and can unexpectedly download large
weights.

## Decision

- Direct-media recognition remains limited to the existing allowlisted audio
  extensions. Owlie does not add generic URL probing or episode-page resolution
  to that recognizer.
- After the bounded binary download, `ffprobe` is the authoritative validation
  gate. It must exit successfully and report a positive duration before ffmpeg
  transcoding begins. Missing, weak, or generic HTTP `Content-Type` headers do
  not reject a recognized direct-media URL.
- Faster-whisper receives `local_files_only=True` when constructing its model.
  The configured curated model name must already be provisioned on the local
  machine. A missing-model failure explains that Owlie never downloads model
  weights and directs the operator to pre-provision the model.
- Podcast and Whisper temporary work directories remain cleanup boundaries on
  validation, transcription, and cancellation failures.

## Consequences

A valid direct-media URL can work despite an absent or generic declared content
type, while a non-audio response with an audio-looking path is rejected before
transcoding. Extraction is deterministic with respect to Whisper model files
and never initiates an implicit weight download. Model installation remains an
environment responsibility, not an Owlie command.

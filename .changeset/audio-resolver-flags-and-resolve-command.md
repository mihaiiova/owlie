---
'owlie': minor
---

Split audio extraction into a resolve stage and a shared transcription stage.
`owlie extract` gains explicit resolver-selection flags (`--podcast-media`,
`--podcast-page`, `--podcast-apple`) that assert which resolver finds the audio
URL, and a new `owlie resolve URL [--<type>-<name>]` command prints the
validated media URL without transcribing it, for consumers that run their own
transcription. New audio sources are added as a `PodcastAudioResolver` plus a
`--<type>-<name>` flag and reuse the generic local faster-whisper pipeline
unchanged (ADR 0022).

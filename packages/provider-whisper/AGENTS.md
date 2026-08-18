# AGENTS — @owlieio/provider-whisper

Local rules for coding agents working in this package. The root `AGENTS.md`
applies first; this file adds whisper-specific guidance.

## Hard boundaries

1. **Do not install or invoke faster-whisper** as part of scaffolding. This
   package is a non-functional surface until transcription work is approved.
2. **Do not add an alternate transcription provider yet.** Local faster-whisper
   is the only intended first provider.
3. **No environment-variable loading.** Configuration is passed as an explicit
   object.
4. **No network calls.** Transcription is local.

## Requirements to document

When transcription is implemented, it must call `ffmpeg`/`ffprobe` and Python
without shell interpolation (use `execFile` with an argument array), enforce
resource limits, and support cancellation via `AbortSignal`.

## Config defaults

- `model`: `small`
- `language`: `auto`
- `computeType`: `int8`

---
'owlie': minor
---

Add local direct-media podcast transcription. `owlie extract <audio-url>` now
downloads a bounded direct podcast media file and transcribes it with local
faster-whisper (ffmpeg/ffprobe + Python), emitting plain transcript text by
default or a normalized podcast transcript document with segment timing through
`--json`. `owlie setup` gains a Transcription section to pick a Whisper model,
and `owlie doctor` reports transcription readiness. The tools are detected but
never installed, and the saved model is persisted in the 0600 user config.

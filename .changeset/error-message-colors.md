---
'@owlieio/owlie': patch
---

Error and usage messages no longer carry an `owlie:` prefix and are now color-coded on a TTY (red for errors, yellow for usage warnings, dim for informational fallback notices); piped/redirected output stays plain. Local-transcription failures now name the specific missing prerequisite (`ffprobe`, `ffmpeg`, `python3`, or `faster-whisper`) instead of embedding a Python traceback, and the "no provider selected" message lists the known providers.

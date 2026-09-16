---
'owlie': patch
---

`owlie doctor` now probes ffmpeg and ffprobe with `-version` (their canonical
flag) instead of `--version`, so transcription readiness is detected correctly
on ffmpeg 7.x and newer.

---
'@owlieio/owlie': patch
---

Fix `owlie setup` transcription prerequisite detection. Probe `ffmpeg` and
`ffprobe` with `-version` (their canonical flag) instead of `--version`,
matching `owlie doctor`. ffmpeg 7.x rejects `--version`, so `owlie setup`
previously reported ffmpeg/ffprobe as missing even when both were installed.

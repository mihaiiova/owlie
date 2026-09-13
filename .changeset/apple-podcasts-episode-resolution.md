---
'owlie': minor
---

Add Apple Podcasts episode resolution. `owlie extract
<podcasts.apple.com episode url>` now resolves the episode through the public
iTunes lookup API (matched by episode id) with a matching RSS `<enclosure>`
fallback, then downloads and transcribes it with the existing local
faster-whisper pipeline. Resolution requires no Apple credentials and uses the
safe HTTP seam throughout.

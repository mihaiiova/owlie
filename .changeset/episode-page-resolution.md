---
'owlie': minor
---

Add generic podcast episode-page audio resolution. `owlie extract
<episode-page-url>` now resolves a server-rendered page's declared audio
enclosure (JSON-LD, oEmbed, `<audio>`/`<source>`, or RSS/Atom enclosure links)
through the safe HTTP seam, then downloads and transcribes it with the existing
local faster-whisper pipeline. It never executes JavaScript, and a safe page
with no declarative audio defers to static article extraction with a stderr
diagnostic.

---
'@owlieio/owlie': patch
---

The progress spinner clears the rest of its line on every frame, so a shorter status such as `waiting for llm response` no longer leaves characters from a longer previous one (for example a YouTube video id) on screen.

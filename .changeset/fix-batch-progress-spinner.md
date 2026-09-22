---
'@owlieio/owlie': patch
---

Fix batch spinner/progress reporting so `owlie process FEED --each` and
`owlie extract FEED` stay consistent with single-item paths: the spinner now
switches to `waiting for llm response` before each item's LLM call, per-item
`progress` events (e.g. whisper transcription progress) reach the spinner, and
batch extraction messages carry a `[i/N]` position so progress through the
bounded limit is visible.

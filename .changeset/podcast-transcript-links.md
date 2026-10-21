---
'@owlieio/owlie': minor
---

Feed entries expose Podcasting 2.0 `<podcast:transcript>` links as `metadata.transcripts: [{ url, type?, language?, rel? }]` in `owlie list --json`, `extract` feed batches and `process --each`, so consumers can use a publisher's transcript instead of transcribing the audio. Only absolute `http(s)` links are kept, and they are not fetched (#143).

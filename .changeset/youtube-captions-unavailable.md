---
'@owlieio/owlie': patch
---

YouTube videos with transcripts disabled, or with no transcript at all, now fail with `CAPTIONS_UNAVAILABLE` instead of `EXTRACTION_ERROR`, so consumers can tell "this video has no captions" from a fetch failure without matching on the message. Blocked requests, unavailable videos and network failures stay `EXTRACTION_ERROR` (#129).

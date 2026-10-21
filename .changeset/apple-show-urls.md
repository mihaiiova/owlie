---
'@owlieio/owlie': minor
---

Apple Podcasts show URLs (`https://podcasts.apple.com/<cc>/podcast/<slug>/id<digits>`, no `?i=` episode id) now work with `owlie list` and `owlie extract`. They resolve to the show's RSS feed through Apple's public lookup, then behave exactly like the feed URL. The collection gains `metadata.apple: { podcastId, showUrl }`. A show without a public feed fails with `EXTRACTION_ERROR`, and `--article` with a show URL is a usage error (#153).

---
'@owlieio/owlie': minor
---

Feed listings stop downloading once they have the entries `--limit` asks for, so listing a few episodes of a very large podcast feed reads a small prefix instead of the whole file (and counts only that against `--max-network-bytes` and `--max-feed-bytes`). New `--order feed|newest` on `list`, `extract` feed batches and `process --each`: `newest` reads the whole feed and sorts entries by publication date, undated entries last; `feed` (the default) keeps document order. Library consumers get `HttpFetchOptions.stopReading` and `CollectionListOptions.sort: 'feed' | 'newest'` on `RssAdapter`.

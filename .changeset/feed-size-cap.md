---
'@owlieio/owlie': minor
---

Feed responses get their own 32 MiB size limit, so podcast feeds with long back catalogues (700+ episodes) can be listed and extracted instead of failing at 5 MiB. The limit applies to any response with an RSS, Atom or XML media type (not XHTML): listing, feed batches, discovery probes and the Apple and episode-page feed fallbacks. HTML pages keep 5 MiB. The new `--max-feed-bytes N` flag changes it; `--max-network-bytes` still caps the invocation total. Library consumers can set `HttpFetchPolicy.maxFeedResponseBytes` (#122).

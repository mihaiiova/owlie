---
'@owlieio/owlie': minor
---

`owlie extract <page URL>` now returns the article when the page is one (it
declares `og:type` article or a JSON-LD article type, or has a long readable
body), instead of discovering the site's feed. Other pages still go to feed
discovery, reusing the same fetch. New `--article` and `--feed` flags force
either path. Article pages no longer carry an `ARTICLE_FALLBACK` warning.

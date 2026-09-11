---
'owlie': patch
---

Normalize static-article publish timestamps to a stable ISO 8601 UTC form.
`@extractus/article-extractor` changed its published-time formatting across
releases, so the article adapter now canonicalizes the value the same way the
RSS adapter does, keeping `publishedAt` output consistent across sources.

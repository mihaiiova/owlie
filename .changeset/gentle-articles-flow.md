---
"owlie": patch
---

Static article extraction no longer drops article bodies that Readability keeps
inside a `<main>` (or other semantic) wrapper. The adapter now passes an
explicit `allowedTags` allowlist to `@extractus/article-extractor`, whose
sanitizer otherwise removes a disallowed element together with its subtree.

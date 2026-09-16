---
'owlie': patch
---

Route authenticated provider model discovery and RSS feed fetching through the
safe HTTP seam. The core fetcher now merges caller-supplied request headers
(keeping control of its own User-Agent and dropping them on cross-origin
redirects), `owlie setup` validates model-discovery responses as JSON before
parsing, and RSS/Atom feeds with a declared incompatible content type are
rejected before XML parsing.

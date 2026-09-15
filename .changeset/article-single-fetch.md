---
'owlie': patch
---

Extracting an ordinary article no longer fetches the page twice. When the
generic podcast episode-page resolver defers to static article extraction, the
already safe-fetched page response is reused by the article adapter, so direct
`owlie extract` and feed batches make one page request per article instead of
two.

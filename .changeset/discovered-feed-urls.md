---
'@owlieio/owlie': patch
---

Feeds at URLs that do not look like feeds now work. A feed found by discovery
(for example `/atom/everything/`) is listed instead of being rejected as "not a
recognized RSS/Atom feed URL", and a URL that itself serves an RSS/Atom feed
(for example `/?feed=rss2` or `https://hnrss.org/frontpage`) is listed or
extracted directly instead of failing discovery.

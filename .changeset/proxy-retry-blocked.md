---
'owlie': patch
---

Through a Webshare proxy, a GET or HEAD request that a site answers with 403 or 429 is sent again, at most twice, each time from a new IP of the rotating endpoint. Some sites block only part of Webshare's IPs, so one blocked IP no longer fails the whole command; a site that blocks every IP still reports its real status. A proxy URL (`OWLIE_PROXY_URL`) is not retried.

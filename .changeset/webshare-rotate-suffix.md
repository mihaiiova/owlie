---
'@owlieio/owlie': patch
---

Fix the Webshare proxy for non-YouTube requests when the saved username already ends in `-rotate` (as Webshare's dashboard shows it). The CLI no longer sends `user-rotate-rotate`, which Webshare rejected with HTTP 407.

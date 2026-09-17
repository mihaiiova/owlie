---
'@owlieio/owlie': patch
---

Fixed Apple Podcasts episode resolution when Apple's `itunes.apple.com/lookup` endpoint serves JSON with a `text/javascript` content type instead of `application/json`. `owlie extract` and `owlie resolve` on Apple Podcasts episode URLs now resolve the episode media URL instead of failing with "unexpected lookup response content type".

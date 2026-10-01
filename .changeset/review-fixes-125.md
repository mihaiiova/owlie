---
'@owlieio/owlie': patch
---

`--max-network-bytes` is now exhausted by the first response that crosses it,
so feed discovery probes and later batch items cannot keep downloading after
the cap. A deadline or cancellation during an episode page's oEmbed or feed
lookup now ends with the cancellation record (exit 130) instead of falling
through to weaker signals. `owlie auth list --env-file FILE` reports keys from
that file.

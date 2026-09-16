---
'@owlieio/owlie': minor
---

`owlie process URL --prompt "..."` now extracts a single http(s) URL through the
universal YouTube/podcast/article rule before processing it, so articles,
YouTube videos, and podcast episodes can be processed directly without a
separate `owlie extract` step. Feed URLs still require `--each`.

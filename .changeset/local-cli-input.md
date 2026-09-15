---
'owlie': patch
---

Model local CLI input as local content. `owlie process` now represents text
files and stdin with the `local` source type (`local:stdin` or
`local:file:<basename>` identities) instead of fabricating an `rss` source
type, and it rejects JSON input with a malformed or missing `sourceType` rather
than defaulting it to `rss`.

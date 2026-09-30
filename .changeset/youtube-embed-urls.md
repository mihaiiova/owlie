---
'@owlieio/owlie': minor
---

YouTube `/embed/<id>` and `/v/<id>` URLs are now extracted like `watch?v=<id>`
URLs and share the same identity. YouTube live-stream (`/live/`) and Shorts
(`/shorts/`) URLs now fail with a clear `VALIDATION_ERROR`.
The message for a blocked transcript request now names the proxy environment
variables, which also work in `--hosted` mode.

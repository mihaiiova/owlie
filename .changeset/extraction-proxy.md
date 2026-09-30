---
'@owlieio/owlie': minor
---

A proxy now carries all extraction traffic (article pages, feeds, podcast
pages, Apple lookups, media downloads, and YouTube), not only YouTube
transcripts. Set it with `OWLIE_PROXY_URL` (`http`, `https`, or `socks5`) or
`OWLIE_WEBSHARE_PROXY_USERNAME`/`OWLIE_WEBSHARE_PROXY_PASSWORD`, which also
work in `--hosted` mode. A proxy saved by `owlie setup` applies the same way.
`owlie doctor` reports the proxy mode and source. LLM provider calls stay
direct.

# ADR 0008 — Proxy configuration for YouTube transcript fetching

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

YouTube blocks transcript requests from datacenter/cloud IP addresses. The
previous Python helper worked around this with a WebShare residential proxy,
and the replacement library (`@hallelx/youtube-transcript`) supports the same
proxy (WebShare and generic HTTP/SOCKS). Users had no way to configure one.

## Decision

- Add a `Proxy` section to `owlie setup` alongside the LLM provider section,
  with three options: `none`, `webshare` (username/password), and `generic`
  (a proxy URL).
- Persist the choice as an optional `proxy` field in
  `~/.config/owlie/config.json` (same `0600` file as the API key).
- Map the provider-neutral proxy shape to the library's
  `WebshareProxyConfig` / `GenericProxyConfig` via a pure function, and pass it
  as `proxyConfig` when constructing the transcript client.
- Add `undici` as a runtime dependency of the published `owlie` package (the
  transcript library loads it dynamically only when a proxy is configured).
- Treat proxy credentials as secrets: stored in the `0600` file, never echoed.

## Consequences

- Users on blocked networks can configure a proxy once and `owlie extract`
  applies it automatically.
- The direct-connection path is unchanged and has no `undici` cost.
- The proxy applies only to YouTube transcript fetching, not to LLM processing.

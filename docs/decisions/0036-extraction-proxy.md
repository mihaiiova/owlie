# ADR 0036 — One proxy for all extraction traffic, configurable in hosted mode

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

ADR 0008 added a proxy for YouTube transcript fetching only, configured through
`owlie setup` and stored in the user configuration. Hosted mode (ADR 0029)
ignores that file, so a product running `owlie --hosted` had no way to set a
proxy, and YouTube blocks transcript requests from datacenter IPs. Article
pages, feeds, podcast pages, Apple lookups, and media downloads always
connected directly, although an operator usually wants one egress path for all
extraction.

## Decision

- **Scope.** A configured proxy carries all extraction traffic: every adapter
  and resolver request through the core safe fetcher (including media
  downloads) and YouTube transcript requests. LLM provider calls, provider
  model discovery, and local Whisper models stay direct.
- **Configuration.** `OWLIE_PROXY_URL` (`http:`, `https:`, or `socks5:`,
  userinfo allowed) or the pair `OWLIE_WEBSHARE_PROXY_USERNAME` +
  `OWLIE_WEBSHARE_PROXY_PASSWORD`. Both forms, a lone Webshare variable, a
  malformed URL, or another scheme is a `CONFIGURATION_ERROR` naming the
  variables but not their values. There is no command-line flag, since
  arguments are visible to other processes.
- **Precedence.** Each source is read as a whole and the first that sets any
  proxy variable wins: process environment → `--env-file` → `.env.local` →
  `.env` → saved `proxy` setting. Hosted mode reads the process environment
  only.
- **Wiring.** The CLI resolves the proxy once per invocation and builds one
  `DefaultHttpFetcher` over a proxied `fetch` (undici `ProxyAgent` or
  `Socks5ProxyAgent`, loaded only when a proxy is set), shared by every default
  extraction adapter. Core gains no dependency or SDK type. Adapters are
  unchanged apart from the YouTube adapter accepting an injected `fetchFn`.
- **Webshare.** YouTube keeps the transcript library's Webshare configuration,
  which rotates IPs and retries on blocks. Other traffic uses Webshare's
  rotating endpoint (`http://<username>-rotate:<password>@p.webshare.io:80`).
  With a proxy URL, YouTube uses the same proxied `fetch` as everything else,
  which also makes SOCKS proxies work for YouTube.
- **SSRF.** The destination check (ADRs 0015/0016) still runs locally before
  each proxied request and on every redirect hop. The proxy host is operator
  configuration and exempt from it.
- **Diagnostics.** `owlie doctor` reports `proxy: { mode, source }` (plus
  `error` when invalid), never the host or credentials.

## Consequences

- A hosted consumer sets the proxy by passing the variables in the process
  environment it already allowlists.
- A proxy saved by `owlie setup` now also applies to articles, feeds, and
  media, not only YouTube. This is a behaviour change for local users with a
  saved proxy, released as a minor version.
- The proxy re-resolves destinations after the local SSRF check, widening the
  existing best-effort TOCTOU window; connect-time enforcement remains deferred.

# Security model

Owlie CLI processes untrusted remote content (feeds, media, transcripts) on a
user's machine. This document establishes the requirements the product will
enforce. Most are future work; they constrain how extraction, transcription,
and processing must be built.

## Network and SSRF

- **SSRF protection** — allow only globally routable unicast destinations by
  default. Canonically classify IPv4, IPv6, and IPv4-mapped IPv6; block private,
  local, metadata, multicast, reserved, and other special-purpose ranges.
  `allowPrivateHosts` opts into private/local ranges only, not a blanket bypass.
  Hostnames are resolved to their IP address(es) and validated on every redirect
  hop (best-effort: a DNS record can still change between the check and the
  connect).
- **Redirect limits** — cap redirects and validate each hop against the same
  destination policy.
- **Request timeouts** — enforce connect and total read timeouts on every
  request.
- **Response and download-size limits** — cap response bodies and downloaded
  media; abort when exceeded.
- **Explicit user agents** — send an identifying `User-Agent` on all requests.
- **Rate-limit handling** — honor `Retry-After` and back off; do not hammer
  sources.

## Parsing and content

- **Safe RSS/Atom parsing** — use a parser with XML entity-expansion protection
  (no billion-laughs/XXE). Parser selection is content-aware, not
  extension-based (Reddit `.rss` returns Atom).
- **MIME-type validation** — verify declared content types before interpreting
  bodies.
- **Safe HTML-to-text conversion** — strip scripts and dangerous markup when
  converting feed content to text.
- **Narrow static article extraction** — accept only bounded `text/html` or
  XHTML obtained through the safe HTTP seam; never let an article extractor
  fetch URLs itself, execute scripts, render JavaScript, authenticate, or
  bypass paywalls.
- **No silent fallback to HTML scraping** — if a feed or static article fails,
  surface the error; never scrape Reddit or use browser-rendering as a fallback.

## Files and processes

- **Temporary-file cleanup** — remove temp downloads and intermediates even on
  failure and cancellation.
- **Safe subprocess invocation** — invoke `ffmpeg`, `ffprobe`, and Python with
  `execFile`-style argument arrays, never shell interpolation.
- **Malicious filename protection** — sanitize names derived from remote
  content before writing to disk.
- **Archive and decompression limits** — bound archive extraction by size,
  count, and path (no path traversal) if archives are ever supported.
- **Cancellation and resource limits** — honor `AbortSignal` everywhere and
  bound CPU/memory for local transcription.

## Secrets and privacy

- **Secret redaction** — never print API keys, tokens, or env values.
- **No credentials in URLs or logs** — reject HTTP(S) URL userinfo on initial
  and redirect URLs. Safe-fetch diagnostics include only origin and path,
  omitting userinfo, query, and fragment.
- **Sanitized fixtures** — test fixtures contain no real credentials or user
  data.
- **No telemetry** — the CLI never phones home with usage or content.

## Default test-suite rule

No real network requests run in the default test suite. Adapters and providers
are scaffolded so their network paths throw `NotImplementedError`.

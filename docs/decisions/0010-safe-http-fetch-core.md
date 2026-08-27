# ADR 0010 — Safe HTTP fetch primitive in `@owlieio/core`

- **Status:** Accepted (address parsing, credential handling, and the runtime-dependency consequence refined by [ADR 0016](0016-canonical-safe-http-destinations.md))
- **Date:** 2026-08-19

## Context

The RSS adapter needed to fetch feeds over the network, which the
[security model](../security-model.md) constrains: SSRF protection (block
private/local/link-local/metadata destinations by default), redirect limits with
per-hop validation, request timeouts, response-size limits, and an identifying
`User-Agent`. No such layer existed. The YouTube adapter had only a
package-local fetch seam specific to its transcript library.

This capability is cross-cutting: RSS `list`, future Reddit/podcast `list`, and
future media download all need it.

## Decision

- Add a provider-neutral safe HTTP fetch primitive to `@owlieio/core`:
  - a pure `isBlockedHost(hostname)` predicate and `assertSafeHttpUrl(url,
{ allowPrivateHosts })` guard;
  - an `HttpFetchPolicy` type (`timeoutMs`, `maxRedirects`, `maxResponseBytes`,
    `allowPrivateHosts`, `userAgent`);
  - an `HttpFetcher` interface with a `DefaultHttpFetcher` over the platform
    `fetch` (no new runtime dependency — Node 20 native).
- `DefaultHttpFetcher` follows redirects manually (`redirect: 'manual'`) so every
  hop is re-validated against the destination policy and the redirect count is
  capped. Errors map to `ExtractionError` (blocked host, HTTP failure, size,
  redirect cap) and `CancelledError` (timeout/abort), consistent with the
  YouTube adapter.

## Consequences

- Core now owns the SSRF destination policy as a pure, unit-tested primitive;
  adapters receive it via explicit `HttpFetcher`/`HttpFetchPolicy` configuration
  (no environment loading in core).
- The initial implementation added no dependency because `fetch`, `Response`,
  `AbortController`, and `TextDecoder` are platform globals. ADR 0016 later adds
  a focused IP parser after handwritten address classification proved unsafe.
- The pure host check covers literal IPv4/IPv6 and reserved hostname suffixes
  (`localhost`, `.local`, `.internal`, `.home.arpa`). DNS-resolution-based SSRF
  (an attacker-controlled hostname that resolves to a private address) is a
  known gap, tracked as future work.

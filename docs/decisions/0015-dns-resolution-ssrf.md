# ADR 0015 — DNS-resolution SSRF protection in the safe HTTP fetch

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

ADR 0010 introduced a pure SSRF guard (`isBlockedHost`, `assertSafeHttpUrl`)
that blocks literal private/local IPs and reserved hostname suffixes, and
explicitly noted a known gap: a normal-looking hostname can resolve via DNS to a
private address (`192.168.1.50`, or the cloud metadata service
`169.254.169.254`) and bypass the check. Every adapter funnels network access
through the core `DefaultHttpFetcher`, so this gap affected all of them.

## Decision

- Add DNS-resolution validation to `DefaultHttpFetcher`, best-effort by design:
  before each fetch hop, resolve the hostname and block the request if **any**
  resolved address is a private/local destination. The existing manual redirect
  loop re-applies the check on every hop.
- Introduce an injectable `DnsResolver` seam (`(hostname) => Promise<string[]>`),
  defaulting to Node's `dns.promises.lookup(host, { all: true })`, mirroring the
  existing `HttpFetchFn` seam so the default test suite stays network-free.
- Reuse the existing pure `isBlockedIpv4`/`isBlockedIpv6` logic via a new
  `isBlockedIp(address)` predicate; `allowPrivateHosts` continues to bypass all
  checks, and a failed lookup is an `ExtractionError`.
- Accept and document the TOCTOU window (a DNS record changing between the check
  and the connect). Connect-time enforcement (a custom undici Agent/dispatcher)
  is deferred as a possible later hardening.

## Consequences

- The ADR 0010 "known gap" is closed best-effort: `evil.example.com →
192.168.1.50` is now refused, per hop, for every adapter using the core seam.
- The residual TOCTOU window remains and is documented in the security model.
- `@owlieio/core` gains no new runtime dependency (`node:dns/promises` is a
  Node builtin); tests inject a fake resolver and make no network calls.

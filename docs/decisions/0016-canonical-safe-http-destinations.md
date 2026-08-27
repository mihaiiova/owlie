# ADR 0016 — Canonical safe-HTTP destination and URL credential policy

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

ADRs 0010 and 0015 established the shared safe-HTTP seam and best-effort DNS
validation. Their handwritten address classifier did not normalize every
textual representation before applying policy. In particular, Node canonicalizes
`http://[::ffff:127.0.0.1]/` to the hexadecimal IPv4-mapped IPv6 host
`::ffff:7f00:1`; the old classifier did not recognize that form as loopback and
skipped DNS validation because it was already an IP literal.

The seam also accepted URL userinfo. Full requested URLs appeared in HTTP,
redirect, and transport errors, so usernames, passwords, and secret-bearing
query strings could reach CLI diagnostics.

Security depends on the semantic address and URL, not their textual spelling.
Maintaining a handwritten parser and an expanding range denylist would keep this
policy fragile.

## Decision

- `@owlieio/core` uses the focused `ipaddr.js` runtime dependency to parse IPv4,
  IPv6, and IPv4-mapped IPv6 into canonical address semantics.
- The default destination policy allows only globally routable unicast
  addresses. Private, carrier-grade NAT, loopback, link-local, unique-local,
  unspecified, broadcast, multicast, benchmarking, documentation/reserved,
  transition, special-purpose, invalid, and mapped equivalents are refused.
- `allowPrivateHosts` is a narrow opt-in. It additionally permits private,
  carrier-grade NAT, loopback, link-local, and unique-local destinations; it
  does not disable parsing or permit unspecified, broadcast, multicast,
  benchmarking, documentation/reserved, transition, special-purpose, or
  invalid destinations.
- Every address returned by DNS must satisfy the applicable policy. A mixed DNS
  result is refused when any address is disallowed.
- HTTP(S) URL userinfo is refused unconditionally on the initial URL and every
  redirect. `allowPrivateHosts` does not permit URL credentials. Core exposes
  the credential-only `assertNoUrlCredentials` guard so CLI dispatch, collection
  summaries, and batch references enforce the same rule before rendering URLs.
- Safe-fetch diagnostics render only URL scheme, host, optional port, and path.
  Userinfo, query, and fragment are omitted. Successful fetch results retain
  the validated final resource URL so diagnostic redaction does not change
  fetch semantics.
- The DNS validation remains best-effort before connection. The DNS rebinding
  TOCTOU window documented by ADR 0015 remains accepted.

## Consequences

- Equivalent and canonical address spellings share one classification path for
  URL literals and DNS results.
- The safe-HTTP interface provides an allowlist guarantee instead of relying on
  a partial range denylist.
- Core gains one small, generic runtime dependency. This supersedes ADR 0010's
  no-new-runtime-dependency consequence; provider neutrality and dependency
  direction are unchanged.
- This refines ADR 0015's statement that `allowPrivateHosts` bypasses all checks:
  it now bypasses only the private/local portion of destination policy.
- Connect-time DNS pinning and complete DNS-rebinding prevention remain
  deferred.

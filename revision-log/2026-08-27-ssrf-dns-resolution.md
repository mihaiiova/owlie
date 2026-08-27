# Review: SSRF DNS-resolution hardening (spec #44)

**Date:** 2026-08-27
**Session:** Hardened the core safe HTTP fetch against DNS-rebinding SSRF: before
each hop, `DefaultHttpFetcher` resolves the hostname (injectable `DnsResolver`
seam, default `dns.promises.lookup`) and refuses the request when any resolved
address is private/local. Added `isBlockedIp` + `assertSafeResolvedHost`, a
`patch` changeset, ADR 0015, and a security-model note. TDD in two red→green
slices.

## History Checked

- 2026-08-20-universal-extract-feed-batches.md
- 2026-08-20-process-feed-batches.md
- 2026-08-19-static-article-extraction.md

## Recurring Patterns

- None new. The prior recurring issue (governing docs updated only at review
  time) did not recur: ADR 0015 and the `security-model.md` update were written
  in the same change as the code, per the §14 rule established last round.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.2   |
| Repetition         | 0.2   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.4   |
| Fragility          | 0.4   |

## Suggestions

None. No improvements needed.

## Changes Made

None beyond the spec — the ADR and security-model updates shipped with the
implementation, so no review-time reconciliation was required.

## Notes

- Two-axis review: zero missing/partial requirements, zero scope creep, zero
  wrong-looking implementations. All ten user stories are covered by the 12 new
  fake-resolver tests; `pnpm check` passes (345 tests).
- Standards: no hard violations. Judgement calls left as-is — the small
  IPv4/IPv6 dispatch shared between `isBlockedHost` and `isBlockedIp` is not
  worth extracting, and `DnsResolver` returning `string[]` keeps the seam
  provider-neutral per the spec.
- Residual risk is the accepted, documented TOCTOU window; connect-time
  enforcement is deferred as a possible later hardening (ADR 0015).

# Review: Canonical safe-HTTP address and credential policy (spec #50)

**Date:** 2026-08-27
**Session:** Hardened the shared safe-HTTP seam with canonical IPv4/IPv6 classification, a public-unicast-only default, a narrow private/local opt-in, unconditional URL-userinfo rejection, and secret-safe diagnostics.

## History Checked

- `2026-08-27-ssrf-dns-resolution.md`
- `2026-08-20-universal-extract-feed-batches.md`
- `2026-08-20-process-feed-batches.md`
- `2026-08-19-static-article-extraction.md`
- `2026-08-19-rss-cli-listing.md`

## Recurring Patterns

- HTTP-boundary edge cases have recurred across static article streaming, DNS-resolution validation, and canonical address/diagnostic handling (`2026-08-19-static-article-extraction.md`, `2026-08-27-ssrf-dns-resolution.md`). The mature IP parser reduces handwritten parsing risk, while public-seam tests remain necessary for cross-layer leaks.
- The prior governing-document drift did not recur: ADR 0016, supersession notes, security documentation, README, changelog, and Changeset were updated during implementation.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.4   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.6   |

## Suggestions

None. No score exceeded `0.6`; no user decision was required.

## Changes Made

- None beyond the spec implementation and review-blocker fixes.

## Notes

- TDD exposed raw query/fragment data in feed spinner text after core fetch errors were already redacted; feed progress messages were made generic.
- A final implementation pass found malformed initial URLs were echoed before parsing; malformed-URL errors are now generic.
- Independent code review found credential-bearing direct and feed-item URLs could still reach CLI stderr or structured output before safe fetching. A shared core credential guard is now applied before direct dispatch, list rendering, and batch references, with CLI regression tests.
- The full repository gate is rerun after review fixes before lifecycle transition.

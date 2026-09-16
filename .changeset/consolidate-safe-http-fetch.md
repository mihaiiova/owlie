---
'owlie': patch
---

Consolidate text and binary safe-HTTP transfers onto a single validated exchange
loop in core, and clean up partial download files when a binary transfer fails,
times out, or is cancelled. Text and binary fetches now share one implementation
point for SSRF checks, redirects, timeouts, cancellation, and error mapping.

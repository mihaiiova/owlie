---
'owlie': minor
---

Add invocation-wide job controls for hosted subprocesses: `--timeout-ms` now
bounds one complete invocation (composed with SIGINT/SIGTERM) across listing,
HTTP, extraction/transcription, feed batches, and provider calls;
`--max-network-bytes` caps total downloads through the core fetch seam and
direct media; and `--max-stdout-bytes` caps stdout before the protocol boundary.
Cancellation (SIGINT/SIGTERM or deadline expiry) now exits 130 with a versioned
`kind: "cancelled"` terminal record instead of a generic exit 1 (ADR 0031).

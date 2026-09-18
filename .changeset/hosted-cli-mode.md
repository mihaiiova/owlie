---
'owlie': minor
---

Add a global `--hosted` mode that makes a single invocation deterministic for
hosted subprocesses: configuration comes from command-line flags and injected
process environment only (no `.env`, `.env.local`, `--env-file`, saved user
configuration, or model-cache fallback). `owlie auth` and `owlie setup` are
rejected before prompting or writing state, and `owlie doctor --json` reports
the effective configuration source (`hosted`/`local`).

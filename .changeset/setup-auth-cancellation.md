---
'@owlieio/owlie': patch
---

`owlie setup` and `owlie auth add` prompts now end at the `--timeout-ms` deadline or on Ctrl-C (exit 130), and an answer that arrives after cancellation is never saved. `owlie auth` failures such as a read-only config directory or a full disk are reported as JSON error records in `--json` mode instead of raw text (#126).

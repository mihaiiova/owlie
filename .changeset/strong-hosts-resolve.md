---
'owlie': patch
---

Harden SSRF protection in the safe HTTP fetch: hostnames are now resolved to
their IP address(es) and refused when any resolved address is a private/local
destination, on every redirect hop (best-effort; the resolver is injectable).
